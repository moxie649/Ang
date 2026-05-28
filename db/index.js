const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
const CHUNK_DIR = path.resolve(__dirname, 'chunks');

fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(CHUNK_DIR);

// 修改 multer 配置：支持相对路径
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fileId = req.query.fileId;
    if (!fileId) {
      return cb(new Error('fileId is required'), '');
    }
    const chunkPath = path.resolve(CHUNK_DIR, fileId);
    fs.ensureDirSync(chunkPath);
    cb(null, chunkPath);
  },
  filename: (req, file, cb) => {
    const index = req.query.index;
    if (!index) {
      return cb(new Error('index is required'), '');
    }
    cb(null, index);
  }
});

const upload = multer({ storage });

// 检查已上传分片（适配相对路径）
app.get('/upload/check', async (req, res) => {
  try {
    const fileId = req.query.fileId;
    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }
    const chunkPath = path.resolve(CHUNK_DIR, fileId);
    let uploaded = [];
    if (fs.existsSync(chunkPath)) {
      uploaded = fs.readdirSync(chunkPath);
    }
    res.json({ uploadedList: uploaded });
  } catch (error) {
    console.error('检查已上传分片失败:', error);
    res.status(500).json({ error: '检查已上传分片失败' });
  }
});

// 上传分片（接收相对路径参数）
app.post('/upload/chunk', upload.single('chunk'), (req, res) => {
  res.send({ status: 'success' });
});

// 合并分片（按文件夹结构保存）
app.post('/upload/merge', async (req, res) => {
  try {
    const { fileId, filename, fileRelativePath, totalChunks } = req.body;

    if (!fileId || !filename || !fileRelativePath || totalChunks === undefined) {
      return res.status(400).json({ 
        error: '缺少必填参数: fileId, filename, fileRelativePath, totalChunks' 
      });
    }

    const chunkPath = path.resolve(CHUNK_DIR, fileId);
    // 按相对路径拼接最终文件路径
    const finalFilePath = path.resolve(UPLOAD_DIR, fileRelativePath);
    // 创建文件夹（如果不存在）
    const finalDir = path.dirname(finalFilePath);
    fs.ensureDirSync(finalDir);

    if (!fs.existsSync(chunkPath)) {
      return res.status(400).json({ error: `分片目录不存在: ${chunkPath}` });
    }

    // 检查分片完整性
    const missingChunks = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkFilePath = path.resolve(chunkPath, i + '');
      if (!fs.existsSync(chunkFilePath)) {
        missingChunks.push(i);
      }
    }
    if (missingChunks.length > 0) {
      return res.status(400).json({
        error: '部分分片文件缺失',
        missingChunks: missingChunks
      });
    }

    // 合并分片
    const writeStream = fs.createWriteStream(finalFilePath);
    for (let i = 0; i < totalChunks; i++) {
      const chunkFilePath = path.resolve(chunkPath, i + '');
      const buffer = fs.readFileSync(chunkFilePath);
      writeStream.write(buffer);
      fs.unlinkSync(chunkFilePath); // 删除单个分片
    }

    writeStream.end();
    await new Promise((resolve) => writeStream.on('finish', resolve));
    fs.rmdirSync(chunkPath); // 删除分片目录

    // 返回可访问的URL
    const relativeUrl = path.relative(UPLOAD_DIR, finalFilePath);
    res.send({
      status: 'success',
      url: `/uploads/${relativeUrl.replace(/\\/g, '/')}` // 统一路径分隔符
    });
  } catch (error) {
    console.error('合并分片失败:', error);
    res.status(500).json({ error: '合并分片失败', message: error.message });
  }
});

// 删除文件（适配文件夹路径）
app.delete('/upload/delete', async (req, res) => {
  try {
    const { fileId, fileRelativePath } = req.body;
    
    if (!fileId || !fileRelativePath) {
      return res.status(400).json({ 
        status: 'error', 
        message: '缺少必填参数: fileId 或 fileRelativePath' 
      });
    }

    // 1. 删除合并后的文件（按相对路径）
    const fullFilePath = path.resolve(UPLOAD_DIR, fileRelativePath);
    if (fs.existsSync(fullFilePath)) {
      await fs.unlink(fullFilePath);
      console.log(`已删除文件: ${fullFilePath}`);
      
      // 尝试删除空文件夹（清理空目录）
      const dirPath = path.dirname(fullFilePath);
      if (dirPath !== UPLOAD_DIR) {
        fs.readdir(dirPath, (err, files) => {
          if (!err && files.length === 0) {
            fs.rmdir(dirPath);
            console.log(`已删除空文件夹: ${dirPath}`);
          }
        });
      }
    }

    // 2. 删除残留的分片目录
    const chunkDirPath = path.resolve(CHUNK_DIR, fileId);
    if (fs.existsSync(chunkDirPath)) {
      await fs.remove(chunkDirPath);
      console.log(`已删除分片目录: ${chunkDirPath}`);
    }

    res.json({
      status: 'success',
      message: '文件删除成功'
    });
  } catch (error) {
    console.error('删除文件失败:', error);
    res.status(500).json({
      status: 'error',
      message: `删除失败: ${error.message}`
    });
  }
});

// 静态访问（支持文件夹路径）
app.use('/uploads', express.static('uploads'));

const PORT = 3001;
app.listen(PORT, () => {
  console.log('Server running on http://localhost:3001');
});