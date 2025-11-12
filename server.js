const express = require('express');
const multer = require('multer');
const { parse } = require('unity-yaml-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
    }
    // 移除文件格式过滤，允许上传任何Unity资产文件
});

// 处理Unity YAML文件的解析（使用 unity-yaml-parser 库）
function parseUnityYaml(content) {
    // unity-yaml-parser 的 parse 函数需要文件路径，而不是字符串内容
    // 所以我们需要先将内容写入临时文件
    const tempFilePath = path.join(os.tmpdir(), `unity_asset_${Date.now()}_${Math.random().toString(36).substring(7)}.asset`);
    
    try {
        // 将内容写入临时文件
        fs.writeFileSync(tempFilePath, content, 'utf8');
        
        // 使用 unity-yaml-parser 库解析文件
        // parse 函数返回一个 Map 对象，键是 fileId，值是 UnityYamlData 对象
        const parsedMap = parse(tempFilePath);
        
        // 将 Map 转换为普通对象，方便前端使用
        // unity-yaml-parser 返回的 Map 中，每个值都是 UnityYamlData 对象
        // UnityYamlData.data 包含实际的 Unity 对象数据（如 { GameObject: {...} }）
        
        // 辅助函数：将对象中的 BigInt 转换为 Number
        function convertBigIntToNumber(obj) {
            if (obj === null || obj === undefined) {
                return obj;
            }
            
            if (typeof obj === 'bigint') {
                return Number(obj);
            }
            
            if (Array.isArray(obj)) {
                return obj.map(convertBigIntToNumber);
            }
            
            if (typeof obj === 'object') {
                const result = {};
                for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        result[key] = convertBigIntToNumber(obj[key]);
                    }
                }
                return result;
            }
            
            return obj;
        }
        
        const result = {};
        
        // 遍历 Map，将每个 UnityYamlData 对象转换为普通对象
        parsedMap.forEach((unityYamlData, fileId) => {
            // unityYamlData.data 是一个对象，通常只有一个键（如 GameObject, Transform 等）
            // 我们直接使用这个数据结构，并添加元数据
            if (unityYamlData.data && typeof unityYamlData.data === 'object') {
                // 获取数据类型（如 GameObject, Transform 等）
                const dataKeys = Object.keys(unityYamlData.data);
                
                if (dataKeys.length > 0) {
                    // 使用第一个键作为主键（通常是 Unity 对象类型）
                    const mainType = dataKeys[0];
                    const mainData = unityYamlData.data[mainType];
                    
                    // 转换 BigInt 为 Number
                    const convertedData = convertBigIntToNumber(mainData);
                    
                    // 创建一个包含元数据和实际数据的对象
                    const dataEntry = {
                        _unityClassId: unityYamlData.classId,
                        _unityFileId: unityYamlData.fileId,
                        _unityStripped: unityYamlData.stripped || false,
                        [mainType]: convertedData
                    };
                    
                    // 使用 fileId 作为键，这样前端可以通过 fileId 访问
                    result[fileId] = dataEntry;
                }
            }
        });
        
        return result;
    } catch (error) {
        console.error('Unity YAML解析失败:', error);
        throw new Error(`解析Unity YAML文件时出错: ${error.message}`);
    } finally {
        // 清理临时文件
        try {
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        } catch (cleanupError) {
            console.warn('清理临时文件失败:', cleanupError);
        }
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