const express = require('express');
const multer = require('multer');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// 配置静态文件服务
app.use(express.static(__dirname));

// 配置Multer用于文件上传
const storage = multer.memoryStorage(); // 存储在内存中，不写入磁盘
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB限制
    },
    fileFilter: (req, file, cb) => {
        // 只允许.prefab文件
        if (file.originalname.endsWith('.prefab')) {
            cb(null, true);
        } else {
            cb(new Error('只支持.prefab文件'), false);
        }
    }
});

// 处理Unity YAML文件的解析
function parseUnityYaml(content) {
    try {
        // 尝试使用宽松模式解析
        const options = {
            json: false,
            strict: false // 宽松模式，忽略未知标签
        };
        
        // 第一层尝试：直接解析
        try {
            return yaml.load(content, options);
        } catch (firstError) {
            console.log('首次解析失败，尝试处理特殊标签:', firstError.message);
            
            // 第二层尝试：预处理Unity特殊标签
            const processedContent = content.replace(/!(<[^>]*>)/g, (match) => {
                // 将标签转换为字符串格式
                return `"${match}"`;
            });
            
            return yaml.load(processedContent, options);
        }
    } catch (error) {
        console.error('YAML解析失败:', error);
        throw new Error(`解析YAML文件时出错: ${error.message}`);
    }
}

// API端点：上传和解析prefab文件
app.post('/api/parse-prefab', upload.single('prefab'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有收到文件' });
        }

        // 将文件内容转换为字符串
        const fileContent = req.file.buffer.toString('utf8');
        
        // 解析YAML内容
        const parsedData = parseUnityYaml(fileContent);
        
        // 返回解析结果
        res.json({
            success: true,
            filename: req.file.originalname,
            data: parsedData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 根路径重定向到index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`Unity Prefab Reader Node.js服务已启动!`);
    console.log(`本地访问地址: http://127.0.0.1:${PORT}`);
    console.log(`========================================`);
});