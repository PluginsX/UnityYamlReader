// 全局变量存储解析后的数据
let parsedData = null;
let selectedFields = new Set();
let searchTerm = '';

// 复选框路径到DOM元素的映射（用于性能优化）
const checkboxMap = new Map();

// 存储搜索筛选后的字段
const searchFilteredFields = new Set(); // 存储搜索筛选后的字段

// 自动选择子字段的开关状态
let autoSelectChildren = false; // 默认禁用自动选择子字段

// 存储字段信息的索引结构，提高搜索性能
let fieldInfoIndex = new Map(); // Map<path, {name, value, element}>

// 存储路径到父路径的映射，用于快速查找父节点
let parentPathMap = new Map();

// 存储路径到子路径的映射，用于快速查找子节点
let childPathMap = new Map();

// 防抖定时器
let searchDebounceTimer = null;

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

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 初始化应用
function initApp() {
    // 设置文件上传事件处理
    fileUpload.addEventListener('change', handleFileUpload);
    
    // 设置搜索框事件处理 - 使用防抖优化
    searchInput.addEventListener('input', debounce(handleSearch, 200));
    
    // 设置导出按钮事件处理
    exportBtn.addEventListener('click', handleExport);
    
    // 设置拖拽区域事件处理
    setupDragAndDrop();
    
    // 设置控制按钮事件处理
    selectAllBtn.addEventListener('click', handleSelectAll);
    deselectAllBtn.addEventListener('click', handleDeselectAll);
    invertSelectionBtn.addEventListener('click', handleInvertSelection);
    
    // 添加自动选择子字段开关按钮的点击事件
    const autoSelectBtn = document.getElementById('auto-select-children');
    if (autoSelectBtn) {
        autoSelectBtn.addEventListener('click', function() {
            // 切换状态
            autoSelectChildren = !autoSelectChildren;
            
            // 更新按钮样式
            if (autoSelectChildren) {
                autoSelectBtn.classList.add('active');
            } else {
                autoSelectBtn.classList.remove('active');
            }
        });
    }
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
    
    // 点击拖拽区域也可以选择文件，但避免与上传按钮点击冲突
    dropArea.addEventListener('click', (e) => {
        // 只有当点击的不是上传按钮时才触发文件选择
        if (!e.target.closest('.upload-btn') && !e.target.closest('#file-upload')) {
            fileUpload.click();
        }
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
    // 不再检查文件类型，允许导入任何文件
    // 只要文件内容符合unity-yaml-parser库的解析要求，就能正常工作
    
    // 更新文件名显示
    fileNameDisplay.textContent = file.name;
    
    // 显示加载状态
    fileNameDisplay.textContent += ' (解析中...)';
    treeContent.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">正在解析文件，请稍候...</div>';
    
    // 重置搜索框和搜索词
    searchInput.value = '';
    searchTerm = '';
    
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
            
            // 重置所有相关集合和映射
            selectedFields.clear();
            fieldInfoIndex.clear();
            parentPathMap.clear();
            childPathMap.clear();
            
            updateSelectedCount();
            
            // 渲染树状结构
            renderTree(parsedData);
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
                <p>请检查文件格式是否正确，或尝试使用其他Unity资产文件。</p>
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
    checkboxMap.clear(); // 清空复选框映射
    fieldInfoIndex.clear(); // 清空字段信息索引
    parentPathMap.clear(); // 清空父路径映射
    childPathMap.clear(); // 清空子路径映射
    
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
    
    // 确保搜索词为空并应用搜索筛选，显示所有字段
    searchTerm = '';
    searchInput.value = '';
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
        
        // 建立父路径映射
        if (parentPath) {
            parentPathMap.set(currentPath, parentPath);
            
            // 建立子路径映射
            if (!childPathMap.has(parentPath)) {
                childPathMap.set(parentPath, new Set());
            }
            childPathMap.get(parentPath).add(currentPath);
        }
    }
    
    // 创建行元素
    const treeRow = document.createElement('div');
    treeRow.className = 'tree-row';
    treeRow.dataset.path = currentPath;
    
    // 如果有子节点，先创建子节点容器
    let childrenContainer = null;
    if (hasChildren) {
        childrenContainer = document.createElement('div');
        childrenContainer.className = 'children';
    }
    
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
    
    // 将复选框添加到映射中（用于性能优化）
    if (currentPath !== 'root') {
        checkboxMap.set(currentPath, checkbox);
    }
    
    // 添加字段信息
    const fieldInfo = document.createElement('div');
    fieldInfo.className = 'field-info';
    
    const fieldNameElement = document.createElement('span');
    fieldNameElement.className = 'field-name';
    fieldNameElement.textContent = fieldName !== 'root' ? fieldName : 'Root';
    fieldInfo.appendChild(fieldNameElement);
    
    // 添加值显示（如果不是对象或数组）
    let fieldValueText = '';
    if (!isObject || (isArray && data.length === 0)) {
        const fieldValue = document.createElement('span');
        fieldValue.className = 'field-value';
        fieldValueText = formatValue(data);
        fieldValue.textContent = fieldValueText;
        fieldInfo.appendChild(fieldValue);
    } else if (isArray) {
        const fieldValue = document.createElement('span');
        fieldValue.className = 'field-value';
        fieldValueText = `Array[${data.length}]`;
        fieldValue.textContent = fieldValueText;
        fieldInfo.appendChild(fieldValue);
    } else {
        const fieldValue = document.createElement('span');
        fieldValue.className = 'field-value';
        fieldValueText = `Object{${Object.keys(data).length}}`;
        fieldValue.textContent = fieldValueText;
        fieldInfo.appendChild(fieldValue);
    }
    
    treeRow.appendChild(fieldInfo);
    container.appendChild(treeRow);
    
    // 将字段信息添加到索引中，用于快速搜索
    if (currentPath !== 'root') {
        fieldInfoIndex.set(currentPath, {
            name: fieldName.toLowerCase(),
            value: fieldValueText.toLowerCase(),
            element: treeRow,
            childrenContainer: childrenContainer
        });
    }
    
    // 添加子节点容器到DOM
    if (hasChildren) {
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

// 获取字段的所有子字段路径 - 优化版本
function getAllChildPaths(path) {
    const childPaths = [];
    
    // 使用子路径映射进行优化，避免遍历所有路径
    function collectAllChildren(currentPath) {
        if (childPathMap.has(currentPath)) {
            const directChildren = childPathMap.get(currentPath);
            directChildren.forEach(childPath => {
                childPaths.push(childPath);
                collectAllChildren(childPath); // 递归收集孙节点
            });
        }
    }
    
    collectAllChildren(path);
    return childPaths;
}

// 批量更新复选框状态（性能优化）
function batchUpdateCheckboxes(paths, checked) {
    // 使用 requestAnimationFrame 来批量更新，避免阻塞UI
    if (paths.length === 0) return;
    
    // 如果路径数量较少，直接更新
    if (paths.length < 100) {
        paths.forEach(path => {
            const checkbox = checkboxMap.get(path);
            if (checkbox) {
                checkbox.checked = checked;
            }
        });
    } else {
        // 如果路径数量较多，分批更新
        const batchSize = 50;
        let index = 0;
        
        const updateBatch = () => {
            const end = Math.min(index + batchSize, paths.length);
            for (let i = index; i < end; i++) {
                const checkbox = checkboxMap.get(paths[i]);
                if (checkbox) {
                    checkbox.checked = checked;
                }
            }
            index = end;
            
            if (index < paths.length) {
                // 使用 setTimeout 让浏览器有机会更新UI
                setTimeout(updateBatch, 0);
            }
        };
        
        updateBatch();
    }
}

// 处理复选框变化 - 确保在单个字段选择时也正确处理子字段
function handleCheckboxChange(checkbox, data, path) {
    const isChecked = checkbox.checked;
    
    // 确保path在searchFilteredFields中才处理
    if (searchFilteredFields.has(path) || path === 'root') {
        if (isChecked) {
            // 选中当前字段
            selectedFields.add(path);
            
            // 只有在autoSelectChildren为true时才自动选择所有子字段
            if (autoSelectChildren) {
                // 获取并选中所有子字段（使用现有的getAllChildPaths函数确保一致性）
                const childPaths = getAllChildPaths(path);
                childPaths.forEach(childPath => {
                    // 只选择搜索筛选后的子字段
                    if (searchFilteredFields.has(childPath)) {
                        selectedFields.add(childPath);
                    }
                });
                
                // 批量更新复选框状态
                batchUpdateCheckboxes(childPaths, true);
            }
        } else {
            // 取消选中当前字段
            selectedFields.delete(path);
            
            // 只有在autoSelectChildren为true时才自动取消选择所有子字段
            if (autoSelectChildren) {
                // 获取并取消选中所有子字段
                const childPaths = getAllChildPaths(path);
                childPaths.forEach(childPath => {
                    // 只取消选择搜索筛选后的子字段
                    if (searchFilteredFields.has(childPath)) {
                        selectedFields.delete(childPath);
                    }
                });
                
                // 批量更新复选框状态
                batchUpdateCheckboxes(childPaths, false);
            }
        }
        
        // 更新所有父节点的复选框状态
        if (path && path !== 'root') {
            updateParentCheckboxes(path);
        }
    }
    
    // 更新选中数量显示
    updateSelectedCount();
}

// 更新指定路径的复选框状态（保留用于单个更新）
function updateCheckboxState(path, checked) {
    const checkbox = checkboxMap.get(path);
    if (checkbox) {
        checkbox.checked = checked;
    }
}

// 更新父节点的复选框状态
function updateParentCheckboxes(path) {
    // 分解路径，找出所有父路径
    const parts = path.split('.');
    
    // 从倒数第二级开始，向上遍历父路径
    for (let i = parts.length - 1; i >= 1; i--) {
        const parentPath = parts.slice(0, i).join('.');
        
        // 获取当前父路径对应的所有直接子路径
        const directChildPaths = Array.from(allFieldPaths).filter(childPath => {
            const childParts = childPath.split('.');
            return childParts.length === i + 1 && 
                   childParts.slice(0, i).join('.') === parentPath;
        });
        
        // 检查所有直接子路径的选中状态
        let allChecked = true;
        let anyChecked = false;
        
        directChildPaths.forEach(childPath => {
            const isChecked = selectedFields.has(childPath);
            allChecked = allChecked && isChecked;
            anyChecked = anyChecked || isChecked;
        });
        
        // 更新父节点的选中状态
        const parentCheckbox = checkboxMap.get(parentPath);
        if (parentCheckbox) {
            // 只有当所有子节点都被选中时，父节点才显示为选中
            const wasChecked = selectedFields.has(parentPath);
            
            if (allChecked) {
                selectedFields.add(parentPath);
                parentCheckbox.checked = true;
            } else {
                selectedFields.delete(parentPath);
                parentCheckbox.checked = false;
            }
            
            // 如果父节点状态发生变化，递归更新其父节点
            const isNowChecked = selectedFields.has(parentPath);
            if (wasChecked !== isNowChecked) {
                // 注意：这里不需要递归调用，因为我们已经在循环中向上遍历
            }
        }
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
    // 使用requestAnimationFrame批量更新DOM，提高性能
    requestAnimationFrame(() => {
        // 清空搜索筛选后的字段集合
        searchFilteredFields.clear();
        
        // 首先收集所有真正匹配搜索条件的字段
        const matchedPaths = new Set();
        
        // 搜索框为空时，显示所有字段
        if (searchTerm === '') {
            // 快速填充searchFilteredFields
            allFieldPaths.forEach(path => {
                searchFilteredFields.add(path);
            });
            
            // 创建包含root和所有字段的显示集合
            const allPathsToShow = new Set(['root', ...allFieldPaths]);
            
            // 批量更新DOM显示
            updateTreeDisplay(allPathsToShow);
            return;
        }
        
        // 使用预构建的索引进行快速搜索，避免遍历DOM
        fieldInfoIndex.forEach((info, path) => {
            const matches = info.name.includes(searchTerm) || info.value.includes(searchTerm);
            if (matches) {
                matchedPaths.add(path);
            }
        });
        
        // 收集所有需要显示的路径（匹配的字段及其所有祖先）
        const pathsToShow = new Set(['root']); // 始终包含root
        
        // 添加匹配字段及其所有祖先
        matchedPaths.forEach(path => {
            pathsToShow.add(path);
            searchFilteredFields.add(path);
            
            // 收集所有祖先路径
            let currentPath = path;
            while (parentPathMap.has(currentPath)) {
                currentPath = parentPathMap.get(currentPath);
                pathsToShow.add(currentPath);
            }
        });
        
        // 批量更新DOM显示
        updateTreeDisplay(pathsToShow, matchedPaths);
    });
}

// 批量更新树状结构的显示 - 性能优化版本
function updateTreeDisplay(pathsToShow, matchedPaths = null) {
    // 首先隐藏所有元素（使用单个操作）
    const allItems = document.querySelectorAll('.tree-row, .children');
    allItems.forEach(item => {
        item.style.display = 'none';
    });
    
    // 批量显示需要的行元素
    pathsToShow.forEach(path => {
        if (path === 'root') {
            // 特殊处理根节点
            const rootRow = document.querySelector('.tree-row[data-path="root"]');
            if (rootRow) {
                rootRow.style.display = '';
                
                // 展开根节点
                const toggleIcon = rootRow.querySelector('.toggle-icon');
                if (toggleIcon && toggleIcon.textContent !== ' ') {
                    toggleIcon.textContent = '▼';
                }
                
                // 显示根节点的子容器
                const childrenContainer = rootRow.nextElementSibling;
                if (childrenContainer && childrenContainer.classList.contains('children')) {
                    childrenContainer.style.display = '';
                }
            }
        } else {
            // 使用索引快速获取元素
            const info = fieldInfoIndex.get(path);
            if (info && info.element) {
                info.element.style.display = '';
                
                // 展开节点
                const toggleIcon = info.element.querySelector('.toggle-icon');
                if (toggleIcon && toggleIcon.textContent !== ' ') {
                    toggleIcon.textContent = '▼';
                }
                
                // 显示子容器
                if (info.childrenContainer) {
                    info.childrenContainer.style.display = '';
                }
            }
        }
    });
}

// 处理导出功能
function handleExport() {
    // 过滤出同时存在于searchFilteredFields和selectedFields中的字段（用户在搜索筛选字段上选择的字段）
    const fieldsToExport = Array.from(selectedFields).filter(path => searchFilteredFields.has(path));
    
    if (fieldsToExport.length === 0) {
        alert('请选择要导出的字段！');
        return;
    }
    
    const exportData = {};
    
    // 收集要导出的字段数据
    fieldsToExport.forEach(path => {
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

// 获取当前可见的字段路径（搜索筛选后的字段）
function getVisibleFieldPaths() {
    // 直接返回searchFilteredFields集合，避免重复查询DOM
    return new Set(searchFilteredFields);
}

// 全选功能 - 仅应用于搜索筛选后的字段 - 优化版本
function handleSelectAll() {
    // 创建新的Set以避免在迭代过程中修改集合
    const newSelectedFields = new Set(selectedFields);
    
    // 添加所有搜索筛选后的字段及其子字段
    searchFilteredFields.forEach(path => {
        // 选中当前字段（仅当它是搜索筛选后的字段时）
        newSelectedFields.add(path);
        
        // 自动选中所有子字段（如果有）
        const childPaths = getAllChildPaths(path);
        childPaths.forEach(childPath => {
            newSelectedFields.add(childPath);
        });
    });
    
    // 一次性替换selectedFields
    selectedFields.clear();
    newSelectedFields.forEach(path => selectedFields.add(path));
    
    // 更新所有复选框状态
    updateAllCheckboxes();
    
    // 更新选中数量显示
    updateSelectedCount();
}

// 取消所有选择功能 - 仅应用于搜索筛选后的字段 - 优化版本
function handleDeselectAll() {
    // 创建新的Set以避免在迭代过程中修改集合
    const newSelectedFields = new Set(selectedFields);
    
    // 移除所有搜索筛选后的字段及其子字段
    searchFilteredFields.forEach(path => {
        // 取消选中当前字段（仅当它是搜索筛选后的字段时）
        newSelectedFields.delete(path);
        
        // 获取所有子路径
        const childPaths = getAllChildPaths(path);
        
        // 批量从选中集合中删除
        childPaths.forEach(childPath => {
            newSelectedFields.delete(childPath);
        });
    });
    
    // 一次性替换selectedFields
    selectedFields.clear();
    newSelectedFields.forEach(path => selectedFields.add(path));
    
    // 更新所有复选框状态
    updateAllCheckboxes();
    
    // 更新选中数量显示
    updateSelectedCount();
}

// 反选功能 - 仅应用于搜索筛选后的字段 - 优化版本
function handleInvertSelection() {
    // 创建新的Set以避免在迭代过程中修改集合
    const newSelectedFields = new Set(selectedFields);
    
    // 遍历所有搜索筛选后的字段进行反选
    searchFilteredFields.forEach(path => {
        if (newSelectedFields.has(path)) {
            // 如果已选中，则取消选中当前字段及其所有子字段
            newSelectedFields.delete(path);
            const childPaths = getAllChildPaths(path);
            childPaths.forEach(childPath => {
                newSelectedFields.delete(childPath);
            });
        } else {
            // 如果未选中，则选中当前字段及其所有子字段
            newSelectedFields.add(path);
            const childPaths = getAllChildPaths(path);
            childPaths.forEach(childPath => {
                newSelectedFields.add(childPath);
            });
        }
    });
    
    // 一次性替换selectedFields
    selectedFields.clear();
    newSelectedFields.forEach(path => selectedFields.add(path));
    
    // 更新所有复选框状态
    updateAllCheckboxes();
    
    // 更新选中数量显示
    updateSelectedCount();
}

// 更新所有复选框状态（性能优化版本）
function updateAllCheckboxes() {
    // 使用 checkboxMap 而不是 querySelectorAll，性能更好
    checkboxMap.forEach((checkbox, path) => {
        checkbox.checked = selectedFields.has(path);
    });
}

// 启动应用
window.addEventListener('DOMContentLoaded', initApp);