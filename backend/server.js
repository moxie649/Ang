const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 中间件
app.use(cors());
app.use(express.json());

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 根路径
app.get('/', (req, res) => {
  res.json({
    message: 'File Upload Server is running',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      upload: 'POST /upload',
      files: 'GET /files',
      download: 'GET /download/:filename'
    }
  });
});

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  // 允许的文件类型
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型: ' + file.mimetype), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

// 上传接口
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '没有文件被上传' });
  }

  res.json({
    success: true,
    message: '文件上传成功',
    data: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      url: `/download/${req.file.filename}`
    }
  });
});

// 多文件上传
app.post('/upload-multiple', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '没有文件被上传' });
  }

  const files = req.files.map(file => ({
    filename: file.filename,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    url: `/download/${file.filename}`
  }));

  res.json({
    success: true,
    message: `成功上传 ${files.length} 个文件`,
    data: files
  });
});

// 获取文件列表
app.get('/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      console.error('读取目录失败:', err);
      return res.status(500).json({ error: '读取文件列表失败' });
    }

    const fileList = files.map(filename => {
      const filepath = path.join(UPLOAD_DIR, filename);
      const stat = fs.statSync(filepath);
      return {
        filename,
        size: stat.size,
        createdAt: stat.birthtime,
        url: `/download/${filename}`
      };
    });

    res.json({
      success: true,
      count: fileList.length,
      data: fileList
    });
  });
});

// 下载文件
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;

  // 安全检查：防止目录遍历攻击
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: '无效的文件名' });
  }

  const filepath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  res.download(filepath, filename, (err) => {
    if (err) {
      console.error('下载文件失败:', err);
      res.status(500).json({ error: '下载文件失败' });
    }
  });
});

// 删除文件
app.delete('/files/:filename', (req, res) => {
  const filename = req.params.filename;

  // 安全检查
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: '无效的文件名' });
  }

  const filepath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  fs.unlink(filepath, (err) => {
    if (err) {
      console.error('删除文件失败:', err);
      return res.status(500).json({ error: '删除文件失败' });
    }

    res.json({
      success: true,
      message: '文件删除成功',
      data: { filename }
    });
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('错误:', err);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制 (最大 100MB)' });
    }
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({
    error: err.message || '服务器内部错误'
  });
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 文件上传服务已启动`);
  console.log(`📡 端口: ${PORT}`);
  console.log(`📁 上传目录: ${UPLOAD_DIR}`);
  console.log(`🔗 访问: http://localhost:${PORT}`);
  console.log(`=================================`);
});

module.exports = app;
