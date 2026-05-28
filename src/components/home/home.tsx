import { useState, useCallback, useEffect, useRef } from 'react';
import SparkMD5 from 'spark-md5';
import axios from 'axios';
import './home.css'; 

// 常量定义
const CHUNK_SIZE = 2 * 1024 * 1024;
const BASE_API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3001';

// 类型定义
interface UploadRecord {
  id: string;
  fileName: string;
  fileRelativePath: string;
  fileSize: number;
  progress: number;
  status: 'uploading' | 'success' | 'failed';
  fileUrl?: string;
  errorMsg?: string;
}

type FileTreeNode = {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileTreeNode[];
  record?: UploadRecord;
};

// 工具函数（抽离独立函数，避免重复）
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// 递归提取文件夹内所有文件（简化逻辑）
const extractAllFiles = (items: FileList | File[]): File[] => {
  const files: File[] = [];
  
  const traverseEntry = (entry: any, parentPath = '') => {
    if (entry.isFile) {
      entry.file((file: File) => {
        (file as any).relativePath = parentPath + file.name;
        files.push(file);
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      reader.readEntries((subEntries: any[]) => {
        subEntries.forEach(subEntry => {
          traverseEntry(subEntry, `${parentPath}${entry.name}/`);
        });
      });
    }
  };

  Array.from(items).forEach(item => {
    if (item.size === 0) return;
    if ((item as any).webkitGetAsEntry) {
      traverseEntry((item as any).webkitGetAsEntry());
    } else {
      files.push(item as File);
    }
  });

  return files;
};

// 构建文件树形结构
const buildFileTree = (records: UploadRecord[]): FileTreeNode => {
  const root: FileTreeNode = { name: '全部文件', type: 'folder', path: '', children: [] };

  records.forEach(record => {
    const pathSegments = record.fileRelativePath.split('/').filter(seg => seg);
    let currentNode = root;
    let currentPath = '';

    pathSegments.forEach((segment, index) => {
      currentPath += (currentPath ? '/' : '') + segment;
      // 文件节点
      if (index === pathSegments.length - 1) {
        currentNode.children?.push({
          name: segment,
          type: 'file',
          path: currentPath,
          record
        });
      } 
      // 文件夹节点
      else {
        let childFolder = currentNode.children?.find(child => child.type === 'folder' && child.name === segment);
        if (!childFolder) {
          childFolder = { name: segment, type: 'folder', path: currentPath, children: [] };
          currentNode.children?.push(childFolder);
        }
        currentNode = childFolder;
      }
    });
  });

  return root;
};

// 递归查找节点
const findNodeByPath = (root: FileTreeNode, path: string): FileTreeNode | undefined => {
  if (root.path === path) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeByPath(child, path);
      if (found) return found;
    }
  }
  return undefined;
};

// 生成面包屑
const generateBreadcrumbs = (currentPath: string, root: FileTreeNode): { name: string; path: string }[] => {
  const breadcrumbs = [{ name: root.name, path: '' }];
  if (!currentPath) return breadcrumbs;

  let current = '';
  currentPath.split('/').filter(seg => seg).forEach(seg => {
    current += (current ? '/' : '') + seg;
    const node = findNodeByPath(root, current);
    if (node) breadcrumbs.push({ name: node.name, path: node.path });
  });

  return breadcrumbs;
};

// 主组件
const Home = () => {
  // 状态管理
  const [isDragging, setIsDragging] = useState(false);
  const [uploadRecords, setUploadRecords] = useState<UploadRecord[]>([]);
  const [fileTree, setFileTree] = useState<FileTreeNode>({ name: '全部文件', type: 'folder', path: '', children: [] });
  const [currentPath, setCurrentPath] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 生命周期 - 加载本地存储
  useEffect(() => {
    const saved = localStorage.getItem('uploadRecords');
    if (saved) setUploadRecords(JSON.parse(saved));
  }, []);

  // 生命周期 - 同步本地存储 & 更新文件树
  useEffect(() => {
    localStorage.setItem('uploadRecords', JSON.stringify(uploadRecords));
    setFileTree(buildFileTree(uploadRecords));
  }, [uploadRecords]);

  // 通用工具方法
  const createChunks = (file: File): Blob[] => {
    const chunks: Blob[] = [];
    let cur = 0;
    while (cur < file.size) {
      chunks.push(file.slice(cur, cur + CHUNK_SIZE));
      cur += CHUNK_SIZE;
    }
    return chunks;
  };

  const calcMD5 = (chunks: Blob[]): Promise<string> => {
    return new Promise((resolve) => {
      const spark = new SparkMD5.ArrayBuffer();
      let count = 0;

      const loadNext = (index: number) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(chunks[index]);
        reader.onload = (e) => {
          spark.append(e.target?.result as ArrayBuffer);
          count++;
          count < chunks.length ? loadNext(count) : resolve(spark.end());
        };
      };

      loadNext(0);
    });
  };

  // 更新上传记录
  const updateRecord = useCallback((id: string, update: Partial<UploadRecord>) => {
    setUploadRecords(prev => prev.map(r => r.id === id ? { ...r, ...update } : r));
  }, []);

  // 删除服务器文件
  const deleteFileFromServer = useCallback(async (fileId: string, fileRelativePath: string) => {
    const res = await axios.delete(`${BASE_API_URL}/upload/delete`, {
      data: { fileId, fileRelativePath }
    });
    if (res.data.status !== 'success') {
      throw new Error(res.data.message || '删除失败');
    }
  }, []);

  // 删除文件记录
  const deleteRecord = useCallback(async (id: string, fileRelativePath: string) => {
    try {
      await deleteFileFromServer(id, fileRelativePath);
      setUploadRecords(prev => prev.filter(r => r.id !== id));
      alert('文件删除成功！');
    } catch (error: any) {
      alert(`删除失败：${error.response?.data?.message || error.message || '删除失败'}`);
    }
  }, [deleteFileFromServer]);

  // 上传单个文件（核心逻辑）
  const uploadSingleFile = useCallback(async (file: File, relativePath?: string) => {
    const fileName = file.name;
    const fileRelativePath = file.webkitRelativePath || relativePath || fileName;
    
    try {
      // 创建分片 & 计算MD5
      const chunks = createChunks(file);
      const fileId = await calcMD5(chunks);

      // 检查文件是否已上传
      if (uploadRecords.some(r => r.id === fileId && r.fileRelativePath === fileRelativePath)) {
        alert(`文件【${fileRelativePath}】已存在`);
        return;
      }

      // 添加上传记录
      setUploadRecords(prev => [{
        id: fileId,
        fileName,
        fileRelativePath,
        fileSize: file.size,
        progress: 0,
        status: 'uploading'
      }, ...prev]);

      // 检查已上传分片
      const { data } = await axios.get(`${BASE_API_URL}/upload/check`, { 
        params: { fileId, fileRelativePath } 
      });
      const { uploadedList } = data;
      let uploadedCount = uploadedList.length;
      updateRecord(fileId, { progress: (uploadedCount / chunks.length) * 100 });

      // 上传未完成分片
      const uploadPromises = chunks.map(async (chunk, index) => {
        if (uploadedList.includes(index + '')) return;
        const formData = new FormData();
        formData.append('chunk', chunk);
        await axios.post(
          `${BASE_API_URL}/upload/chunk?fileId=${fileId}&index=${index}&fileRelativePath=${encodeURIComponent(fileRelativePath)}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        uploadedCount++;
        updateRecord(fileId, { progress: (uploadedCount / chunks.length) * 100 });
      });

      await Promise.all(uploadPromises);
      updateRecord(fileId, { progress: 100 });

      // 合并分片
      const mergeRes = await axios.post(`${BASE_API_URL}/upload/merge`, {
        fileId,
        filename: fileName,
        fileRelativePath,
        totalChunks: chunks.length
      });

      if (mergeRes.data.status === 'success') {
        updateRecord(fileId, {
          status: 'success',
          fileUrl: `${BASE_API_URL}${mergeRes.data.url}`
        });
      }
    } catch (error: any) {
      console.error('上传失败:', error);
      const fileId = error.fileId || '';
      if (fileId) {
        updateRecord(fileId, { 
          status: 'failed', 
          errorMsg: error.message || '上传失败' 
        });
      } else {
        setUploadRecords(prev => [{
          id: `error-${Date.now()}`,
          fileName,
          fileRelativePath,
          fileSize: file.size,
          progress: 0,
          status: 'failed',
          errorMsg: error.message || '初始化失败'
        }, ...prev]);
      }
    }
  }, [uploadRecords, updateRecord]);

  // 批量上传文件
  const uploadFiles = useCallback((files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(file => file.size > 0);
    const allFiles = extractAllFiles(validFiles);

    setTimeout(() => {
      allFiles.forEach(file => {
        const relativePath = file.webkitRelativePath || (file as any).relativePath || file.name;
        uploadSingleFile(file, relativePath);
      });
    }, 100);
  }, [uploadSingleFile]);

  // 拖拽事件处理（统一处理逻辑）
  const handleDragEvent = useCallback((e: React.DragEvent<HTMLDivElement>, type: 'enter' | 'over' | 'leave' | 'drop') => {
    e.preventDefault();
    e.stopPropagation();
    
    switch (type) {
      case 'enter':
      case 'over':
        setIsDragging(true);
        break;
      case 'leave':
      case 'drop':
        setIsDragging(false);
        if (type === 'drop') {
          const filesToUpload: File[] = [];
          const traverseFileTree = (item: any, path = '') => {
            if (item.isFile) {
              item.file((file: File) => {
                (file as any).relativePath = path + file.name;
                filesToUpload.push(file);
              });
            } else if (item.isDirectory) {
              const dirReader = item.createReader();
              dirReader.readEntries((entries: any[]) => {
                entries.forEach(entry => traverseFileTree(entry, `${path}${item.name}/`));
              });
            }
          };

          Array.from(e.dataTransfer.items).forEach(item => {
            const entry = item.webkitGetAsEntry();
            if (entry) traverseFileTree(entry);
          });

          setTimeout(() => uploadFiles(filesToUpload), 100);
        }
        break;
    }
  }, [uploadFiles]);

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) uploadFiles(e.target.files);
    e.target.value = '';
  };

  // 进入文件夹
  const enterFolder = (path: string) => setCurrentPath(path);

  // 计算当前目录数据
  const currentNode = findNodeByPath(fileTree, currentPath);
  const breadcrumbs = generateBreadcrumbs(currentPath, fileTree);
  const currentItems = currentNode?.children || [];

  // 渲染
  return (
    <div className="container">
      <h2 className="title">大文件分片上传（支持文件夹）</h2>
      
      {/* 拖拽上传区域 */}
      <div
        className={`drag-area ${isDragging ? 'active' : ''}`}
        onDragEnter={(e) => handleDragEvent(e, 'enter')}
        onDragOver={(e) => handleDragEvent(e, 'over')}
        onDragLeave={(e) => handleDragEvent(e, 'leave')}
        onDrop={(e) => handleDragEvent(e, 'drop')}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="drag-tip">
          <p>将文件/文件夹拖到此处上传</p>
          <p className="drag-subtip">或点击区域选择文件/文件夹</p>
        </div>
      </div>

      {/* 文件选择框 - 修复警告的核心位置 */}
      <input
  ref={fileInputRef}
  id="file-input"
  type="file"
  onChange={handleFileSelect}
  className="file-input"
  multiple
  {...({
    webkitdirectory: "true",
    directory: "true",
    mozdirectory: "true"
  } as any)}
/>

      {/* 上传记录 */}
      <div className="record-wrap">
        <h3 className="record-title">上传记录</h3>
        {uploadRecords.length === 0 ? (
          <div className="record-empty">暂无上传记录</div>
        ) : (
          <div className="file-manager-container">
            {/* 面包屑导航 */}
            <div className="breadcrumb">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.path}>
                  {index > 0 && <span className="breadcrumb-separator"> / </span>}
                  <span 
                    className="breadcrumb-item"
                    onClick={() => setCurrentPath(crumb.path)}
                  >
                    {crumb.name}
                  </span>
                </span>
              ))}
            </div>

            {/* 文件列表 */}
            <div className="file-list">
              <div className="file-list-header">
                <div className="file-name-header">名称</div>
                <div className="file-size-header">大小</div>
                <div className="file-progress-header">进度</div>
                <div className="file-status-header">状态</div>
                <div className="file-action-header">操作</div>
              </div>
              <div className="file-list-body">
                {currentItems.map(item => {
                  // 文件夹节点
                  if (item.type === 'folder') {
                    return (
                      <div 
                        key={item.path} 
                        className="file-list-item folder-item"
                        onClick={() => enterFolder(item.path)}
                      >
                        <div className="file-name">
                          <span className="folder-icon">📁</span>
                          <span>{item.name}</span>
                        </div>
                        <div className="file-size">-</div>
                        <div className="file-progress">-</div>
                        <div className="file-status">文件夹</div>
                        <div className="file-action">-</div>
                      </div>
                    );
                  }

                  // 文件节点
                  if (item.type === 'file' && item.record) {
                    const record = item.record;
                    return (
                      <div key={record.id} className="file-list-item file-item">
                        <div className="file-name">
                          <span className="file-icon">📄</span>
                          {record.status === 'success' && record.fileUrl ? (
                            <a
                              href={record.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={record.fileRelativePath}
                              style={{ color: '#333', textDecoration: 'none', cursor: 'pointer' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#1890ff')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#333')}
                            >
                              {record.fileName}
                            </a>
                          ) : (
                            <span title={record.fileRelativePath}>{record.fileName}</span>
                          )}
                        </div>
                        <div className="file-size">{formatFileSize(record.fileSize)}</div>
                        <div className="file-progress">
                          <div className="progress-bar">
                            <div 
                              className={`progress-fill ${record.status}`}
                              style={{ width: `${record.progress}%` }}
                            />
                          </div>
                          <span className="progress-text">{record.progress.toFixed(0)}%</span>
                        </div>
                        <div className="file-status">
                          <span className={`status-tag ${record.status}`}>
                            {record.status === 'uploading' ? '上传中' : 
                             record.status === 'success' ? '已完成' : '上传失败'}
                          </span>
                        </div>
                        <div className="file-action">
                          <button 
                            className="del-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRecord(record.id, record.fileRelativePath);
                            }}
                          >
                            删除
                          </button>
                        </div>
                        {/* 失败提示 */}
                        {record.status === 'failed' && record.errorMsg && (
                          <div 
                            className="file-error-row"
                            style={{ 
                              gridColumn: '1 / -1', 
                              padding: '8px 0 8px 32px', 
                              fontSize: '13px',
                              color: '#ff4d4f',
                              borderTop: '1px dashed #eee',
                              marginTop: '8px'
                            }}
                          >
                            失败原因：{record.errorMsg}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;

