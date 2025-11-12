// 全局变量存储解析后的数据
let parsedData = null;
let selectedFields = new Set();
let searchTerm = '';

// DOM元素引用
const fileUpload = document.getElementById('file-upload');
const fileNameDisplay = document.getElementById('file-name');
const treeContent = document.getElementById('tree-content');
const searchInput = document.getElementById('search-input');
const exportBtn = document.getElementById('export-btn');
const selectedCount = document.getElementById('selected-count');
const dropArea = document.getElementById('drop-area');
const treeControls = document.getElementById('tree-controls');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const invertSelectionBtn = document.getElementById('invert-selection-btn');

// 初始化应用
function initApp() {
    // 设置文件上传事件处理
    fileUpload.addEventListener('change', handleFileUpload);
    
    // 设置搜索框事件处理
    searchInput.addEventListener('input', handleSearch);
    
    // 设置导出按钮事件处理
    exportBtn.addEventListener('click', handleExport);
    
    // 设置拖拽区域事件处理
    setupDragAndDrop();
    
    // 设置控制按钮事件处理
    selectAllBtn.addEventListener('click', handleSelectAll);
    deselectAllBtn.addEventListener('click', handleDeselectAll);
    invertSelectionBtn.addEventListener('click', handleInvertSelection);
}

// 设置拖拽区域功能
function setupDragAndDrop() {
    // 阻止默认的拖拽行为
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    // 添加拖拽样式变化
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    // 处理放置事件
    dropArea.addEventListener('drop', handleDrop, false);
    
    // 点击拖拽区域也可以选择文件
    dropArea.addEventListener('click', () => {
        fileUpload.click();
    });
}

// 阻止默认行为
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// 添加拖拽高亮样式
function highlight() {
    dropArea.classList.add('drag-over');
}

// 移除拖拽高亮样式
function unhighlight() {
    dropArea.classList.remove('drag-over');
}

// 处理文件放置
function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
        const file = files[0];
        handleFile(file);
    }
}

// 统一处理文件的函数
function handleFile(file) {
    // 检查文件类型
    if (!file.name.endsWith('.prefab')) {
        alert('请选择.prefab文件！');
        return;
    }
    
    // 更新文件名显示
    fileNameDisplay.textContent = file.name;
    
    // 显示加载状态
    fileNameDisplay.textContent += ' (解析中...)';
    treeContent.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">正在解析文件，请稍候...</div>';
    
    // 创建FormData对象
    const formData = new FormData();
    formData.append('prefab', file);
    
    // 调用后端API进行解析
    fetch('/api/parse-prefab', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('网络响应错误');
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // 更新UI，移除加载状态
            fileNameDisplay.textContent = file.name;
            
            // 存储解析后的数据
            parsedData = data.data;
            
            // 重置选择集合
            selectedFields.clear();
            updateSelectedCount();
            
            // 渲染树状结构
            renderTree(parsedData);
            
            // 应用搜索过滤器
            applySearchFilter();
        } else {
            throw new Error(data.error || '解析失败');
        }
    })
    .catch(error => {
        // 显示错误信息
        console.error('解析文件时出错:', error);
        fileNameDisplay.textContent = file.name;
        treeContent.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #ff4444;">
                <h3>解析文件时出错</h3>
                <p>${error.message}</p>
                <p>请检查文件格式是否正确，或尝试使用其他版本的prefab文件。</p>
            </div>
        `;
        // 禁用导出按钮
        exportBtn.disabled = true;
        // 隐藏控制按钮
        if (treeControls) {
            treeControls.style.display = 'none';
        }
    });
}

// 处理文件上传
function handleFileUpload(event) {
    const file = event.target.files[0];
    
    if (file) {
        handleFile(file);
    }
    
    // 重置input，允许重新选择同一文件
    fileUpload.value = '';
}

// 存储所有字段路径（用于全选/反选功能）
let allFieldPaths = new Set();

// 渲染树形结构
function renderTree(data) {
    // 清空树内容
    treeContent.innerHTML = '';
    allFieldPaths.clear();
    
    if (!data || typeof data !== 'object') {
        treeContent.innerHTML = '<p class="placeholder-text">文件内容为空或无效</p>';
        treeControls.style.display = 'none';
        return;
    }
    
    // 显示控制按钮
    treeControls.style.display = 'flex';
    
    // 创建根节点
    const rootContainer = document.createElement('div');
    rootContainer.className = 'tree-item';
    
    // 递归渲染数据
    renderNode(rootContainer, data, 'root');
    
    treeContent.appendChild(rootContainer);
    
    // 应用搜索筛选
    applySearchFilter();
}

// 递归渲染节点
function renderNode(container, data, fieldName, parentPath = '') {
    const currentPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
    const isObject = typeof data === 'object' && data !== null;
    const isArray = Array.isArray(data);
    const hasChildren = isObject && (isArray || Object.keys(data).length > 0);
    
    // 收集所有字段路径（排除root）
    if (currentPath !== 'root') {
        allFieldPaths.add(currentPath);
    }
    
    // 创建行元素
    const treeRow = document.createElement('div');
    treeRow.className = 'tree-row';
    treeRow.dataset.path = currentPath;
    
    // 添加展开/折叠图标
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'toggle-icon';
    if (hasChildren) {
        toggleIcon.textContent = '▼';
        toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNode(childrenContainer);
        });
    } else {
        toggleIcon.textContent = ' ';
    }
    treeRow.appendChild(toggleIcon);
    
    // 添加复选框
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'checkbox-container';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.path = currentPath;
    checkbox.checked = selectedFields.has(currentPath);
    checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        handleCheckboxChange(checkbox, data, currentPath);
    });
    checkboxContainer.appendChild(checkbox);
    treeRow.appendChild(checkboxContainer);
    
    // 添加字段信息
    const fieldInfo = document.createElement('div');
    fieldInfo.className = 'field-info';
    
    const fieldNameElement = document.createElement('span');
    fieldNameElement.className = 'field-name';
    fieldNameElement.textContent = fieldName !== 'root' ? fieldName : 'Root';
    fieldInfo.appendChild(fieldNameElement);
    
    // 添加值显示（如果不是对象或数组）
    if (!isObject || (isArray && data.length === 0)) {
        const fieldValue = document.createElement('span');
        fieldValue.className = 'field-value';
        fieldValue.textContent = formatValue(data);
        fieldInfo.appendChild(fieldValue);
    } else if (isArray) {
        const fieldValue = document.createElement('span');
        fieldValue.className = 'field-value';
        fieldValue.textContent = `Array[${data.length}]`;
        fieldInfo.appendChild(fieldValue);
    } else {
        const fieldValue = document.createElement('span');
        fieldValue.className = 'field-value';
        fieldValue.textContent = `Object{${Object.keys(data).length}}`;
        fieldInfo.appendChild(fieldValue);
    }
    
    treeRow.appendChild(fieldInfo);
    container.appendChild(treeRow);
    
    // 如果有子节点，创建子节点容器
    if (hasChildren) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'children';
        container.appendChild(childrenContainer);
        
        // 递归渲染子节点
        if (isArray) {
            data.forEach((item, index) => {
                renderNode(childrenContainer, item, `[${index}]`, currentPath);
            });
        } else {
            Object.keys(data).forEach(key => {
                renderNode(childrenContainer, data[key], key, currentPath);
            });
        }
    }
}

// 切换节点展开/折叠状态
function toggleNode(childrenContainer) {
    const isVisible = childrenContainer.style.display !== 'none';
    childrenContainer.style.display = isVisible ? 'none' : 'block';
    
    // 更新父节点的展开图标
    const toggleIcon = childrenContainer.previousElementSibling.querySelector('.toggle-icon');
    if (toggleIcon) {
        toggleIcon.textContent = isVisible ? '▶' : '▼';
    }
}

// 递归收集所有子路径
function getAllChildPaths(parentPath) {
    const childPaths = [];
    // 从 allFieldPaths 中查找所有以 parentPath 开头的路径
    allFieldPaths.forEach(fieldPath => {
        if (fieldPath.startsWith(`${parentPath}.`)) {
            childPaths.push(fieldPath);
        }
    });
    return childPaths;
}

// 处理复选框变化
function handleCheckboxChange(checkbox, data, path) {
    const isChecked = checkbox.checked;
    
    if (isChecked) {
        // 选中当前字段
        selectedFields.add(path);
        
        // 自动选中所有子字段
        const childPaths = getAllChildPaths(path);
        childPaths.forEach(childPath => {
            selectedFields.add(childPath);
            // 更新子复选框的显示状态
            updateCheckboxState(childPath, true);
        });
    } else {
        // 取消选中当前字段
        selectedFields.delete(path);
        
        // 删除所有子路径的选中状态
        const pathsToDelete = Array.from(selectedFields).filter(p => p.startsWith(`${path}.`));
        pathsToDelete.forEach(p => {
            selectedFields.delete(p);
            // 更新子复选框的显示状态
            updateCheckboxState(p, false);
        });
    }
    
    // 更新选中数量显示
    updateSelectedCount();
}

// 更新指定路径的复选框状态
function updateCheckboxState(path, checked) {
    const checkbox = document.querySelector(`input[type="checkbox"][data-path="${path}"]`);
    if (checkbox) {
        checkbox.checked = checked;
    }
}

// 更新选中数量显示
function updateSelectedCount() {
    selectedCount.textContent = `已选择: ${selectedFields.size} 个字段`;
    
    // 根据选中数量启用/禁用导出按钮
    if (selectedFields.size > 0 && parsedData) {
        exportBtn.disabled = false;
    } else {
        exportBtn.disabled = true;
    }
}

// 格式化显示值
function formatValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') {
        // 限制字符串长度
        if (value.length > 50) {
            return value.substring(0, 50) + '...';
        }
        return `"${value}"`;
    }
    if (Array.isArray(value)) {
        return `[${value.length}]`;
    }
    return '{...}';
}

// 处理搜索
function handleSearch(event) {
    searchTerm = event.target.value.toLowerCase();
    applySearchFilter();
}

// 应用搜索筛选
function applySearchFilter() {
    const allRows = document.querySelectorAll('.tree-row');
    
    allRows.forEach(row => {
        const fieldName = row.querySelector('.field-name').textContent.toLowerCase();
        const fieldValue = row.querySelector('.field-value')?.textContent.toLowerCase() || '';
        
        const matches = fieldName.includes(searchTerm) || fieldValue.includes(searchTerm);
        
        if (searchTerm === '' || matches) {
            row.style.display = '';
            // 确保父节点也显示
            let parent = row.parentElement;
            while (parent && parent.classList.contains('children')) {
                parent.style.display = '';
                // 更新父节点的展开图标
                const parentRow = parent.previousElementSibling;
                if (parentRow && parentRow.classList.contains('tree-row')) {
                    const toggleIcon = parentRow.querySelector('.toggle-icon');
                    if (toggleIcon) {
                        toggleIcon.textContent = '▼';
                    }
                }
                parent = parent.parentElement.parentElement;
            }
        } else {
            row.style.display = 'none';
        }
    });
}

// 处理导出功能
function handleExport() {
    if (selectedFields.size === 0) {
        alert('请选择要导出的字段！');
        return;
    }
    
    const exportData = {};
    
    // 收集选中的字段数据
    selectedFields.forEach(path => {
        const value = getValueByPath(parsedData, path);
        setValueByPath(exportData, path, value);
    });
    
    // 转换为JSON字符串
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // 创建下载链接
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prefab_export.json';
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}

// 根据路径获取值
function getValueByPath(obj, path) {
    if (path === 'root') return obj;
    
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 1; i < parts.length; i++) { // 从索引1开始，跳过'root'
        const part = parts[i];
        
        // 处理数组索引
        if (part.startsWith('[') && part.endsWith(']')) {
            const index = parseInt(part.slice(1, -1));
            if (Array.isArray(current) && index >= 0 && index < current.length) {
                current = current[index];
            } else {
                return undefined;
            }
        } else if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return undefined;
        }
    }
    
    return current;
}

// 根据路径设置值
function setValueByPath(obj, path, value) {
    if (path === 'root') {
        Object.assign(obj, value);
        return;
    }
    
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 1; i < parts.length - 1; i++) { // 遍历到倒数第二部分
        const part = parts[i];
        
        // 处理数组索引
        if (part.startsWith('[') && part.endsWith(']')) {
            const index = parseInt(part.slice(1, -1));
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        } else {
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        }
    }
    
    // 设置最后一部分的值
    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
}

// 全选功能
function handleSelectAll() {
    // 将所有字段路径添加到选中集合
    allFieldPaths.forEach(path => {
        selectedFields.add(path);
    });
    
    // 更新所有复选框状态
    updateAllCheckboxes();
    
    // 更新选中数量显示
    updateSelectedCount();
}

// 取消所有选择功能
function handleDeselectAll() {
    // 清空选中集合
    selectedFields.clear();
    
    // 更新所有复选框状态
    updateAllCheckboxes();
    
    // 更新选中数量显示
    updateSelectedCount();
}

// 反选功能
function handleInvertSelection() {
    // 遍历所有字段路径，切换选中状态
    allFieldPaths.forEach(path => {
        if (selectedFields.has(path)) {
            selectedFields.delete(path);
        } else {
            selectedFields.add(path);
        }
    });
    
    // 更新所有复选框状态
    updateAllCheckboxes();
    
    // 更新选中数量显示
    updateSelectedCount();
}

// 更新所有复选框状态
function updateAllCheckboxes() {
    const allCheckboxes = document.querySelectorAll('.checkbox-container input[type="checkbox"]');
    allCheckboxes.forEach(checkbox => {
        const path = checkbox.dataset.path;
        if (path && path !== 'root') {
            checkbox.checked = selectedFields.has(path);
        }
    });
}

// 启动应用
window.addEventListener('DOMContentLoaded', initApp);