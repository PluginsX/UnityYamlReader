// 全局变量存储解析后的数据
let parsedData = null;
let selectedFields = new Set();
let searchTerm = '';

// 复选框路径到DOM元素的映射（用于性能优化）
const checkboxMap = new Map();

// 存储搜索筛选后的字段
const searchFilteredFields = new Set(); // 存储搜索筛选后的字段

// 自动选择子字段的开关状态
let autoSelectChildren = true; // 默认禁用自动选择子字段

// 存储字段信息的索引结构，提高搜索性能
let fieldInfoIndex = new Map(); // Map<path, {name, value, element}>

// 存储路径到父路径的映射，用于快速查找父节点
let parentPathMap = new Map();

// 存储路径到子路径的映射，用于快速查找子节点
let childPathMap = new Map();

// 防抖定时器
let searchDebounceTimer = null;

// 存储节点元数据，用于延迟渲染
let nodeMetadataMap = new Map(); // Map<path, { name, displayName, value, valueText, hasChildren, type }>

// 存储展开状态
let expandedPaths = new Set();

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
    autoSelectBtn.classList.add('active');// 默认为自动选择子字段
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
    nodeMetadataMap.clear(); // 清空节点元数据
    expandedPaths = new Set(['root']); // 默认仅展开根节点
    
    if (!data || typeof data !== 'object') {
        treeContent.innerHTML = '<p class="placeholder-text">文件内容为空或无效</p>';
        treeControls.style.display = 'none';
        return;
    }
    
    indexTreeData(data); // 预构建节点元数据
    
    // 显示控制按钮
    treeControls.style.display = 'flex';
    
    // 创建根节点容器
    const rootContainer = document.createElement('div');
    rootContainer.className = 'tree-item';
    
    // 渲染根节点
    createTreeRow('root', rootContainer);
    
    // 默认展开 Root，仅渲染一级
    renderChildrenForPath('root');
    
    treeContent.appendChild(rootContainer);
    
    // 确保搜索词为空并应用搜索筛选，显示所有字段
    searchTerm = '';
    searchInput.value = '';
    applySearchFilter();
}

// 预构建节点元数据，用于延迟渲染
function indexTreeData(data) {
    function traverse(node, path = 'root', fieldName = 'root') {
        const isObject = typeof node === 'object' && node !== null;
        const isArray = Array.isArray(node);
        const hasChildren = isObject && ((isArray && node.length > 0) || (!isArray && Object.keys(node).length > 0));
        const displayName = fieldName === 'root' ? 'Root' : fieldName;
        const valueText = computeNodeValueText(node, isObject, isArray);
        
        nodeMetadataMap.set(path, {
            name: fieldName,
            displayName,
            value: node,
            valueText,
            hasChildren,
            isObject,
            isArray
        });
        
        if (path !== 'root') {
            allFieldPaths.add(path);
        }
        
        if (hasChildren) {
            if (!childPathMap.has(path)) {
                childPathMap.set(path, new Set());
            }
            
            if (isArray) {
                node.forEach((item, index) => {
                    const childName = `[${index}]`;
                    const childPath = `${path}.${childName}`;
                    childPathMap.get(path).add(childPath);
                    parentPathMap.set(childPath, path);
                    traverse(item, childPath, childName);
                });
            } else {
                Object.keys(node).forEach(key => {
                    const childPath = `${path}.${key}`;
                    childPathMap.get(path).add(childPath);
                    parentPathMap.set(childPath, path);
                    traverse(node[key], childPath, key);
                });
            }
        }
    }
    
    traverse(data);
}

// 构建节点行并注册事件，默认仅渲染自身
function createTreeRow(path, container) {
    const metadata = nodeMetadataMap.get(path);
    if (!metadata) return;
    
    const treeRow = document.createElement('div');
    treeRow.className = 'tree-row';
    treeRow.dataset.path = path;
    
    const toggleIcon = document.createElement('span');
    toggleIcon.className = 'toggle-icon';
    if (metadata.hasChildren) {
        const isExpanded = expandedPaths.has(path);
        toggleIcon.textContent = isExpanded ? '▼' : '▶';
        toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNode(path);
        });
    } else {
        toggleIcon.textContent = ' ';
    }
    treeRow.appendChild(toggleIcon);
    
    const checkboxContainer = document.createElement('div');
    checkboxContainer.className = 'checkbox-container';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.path = path;
    checkbox.checked = path === 'root' ? true : selectedFields.has(path);
    checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        handleCheckboxChange(checkbox, metadata.value, path);
    });
    
    if (path === 'root') {
        checkbox.checked = true;
        checkbox.disabled = true;
    } else {
        checkboxMap.set(path, checkbox);
    }
    
    checkboxContainer.appendChild(checkbox);
    treeRow.appendChild(checkboxContainer);
    
    const fieldInfo = document.createElement('div');
    fieldInfo.className = 'field-info';
    
    const fieldNameElement = document.createElement('span');
    fieldNameElement.className = 'field-name';
    fieldNameElement.textContent = metadata.displayName;
    fieldInfo.appendChild(fieldNameElement);
    
    const fieldValue = document.createElement('span');
    fieldValue.className = 'field-value';
    fieldValue.textContent = metadata.valueText;
    fieldInfo.appendChild(fieldValue);
    
    treeRow.appendChild(fieldInfo);
    container.appendChild(treeRow);
    
    let childrenContainer = null;
    if (metadata.hasChildren) {
        const isExpanded = expandedPaths.has(path);
        childrenContainer = document.createElement('div');
        childrenContainer.className = 'children';
        childrenContainer.style.display = isExpanded ? 'block' : 'none';
        childrenContainer.dataset.rendered = 'false';
        container.appendChild(childrenContainer);
    }
    
    fieldInfoIndex.set(path, {
        name: metadata.displayName.toLowerCase(),
        value: metadata.valueText.toLowerCase(),
        element: treeRow,
        childrenContainer
    });
}

// 在需要时按需渲染子节点
function renderChildrenForPath(path) {
    const info = fieldInfoIndex.get(path);
    const metadata = nodeMetadataMap.get(path);
    if (!info || !metadata || !metadata.hasChildren || !info.childrenContainer) {
        return;
    }
    
    if (info.childrenContainer.dataset.rendered === 'true') {
        return;
    }
    
    const childrenPaths = childPathMap.get(path);
    if (!childrenPaths || childrenPaths.size === 0) {
        info.childrenContainer.dataset.rendered = 'true';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    childrenPaths.forEach(childPath => {
        createTreeRow(childPath, fragment);
    });
    info.childrenContainer.appendChild(fragment);
    info.childrenContainer.dataset.rendered = 'true';
}

// 确保指定路径的节点已渲染
function ensurePathRendered(path) {
    if (fieldInfoIndex.has(path)) {
        return;
    }
    
    const parentPath = parentPathMap.get(path);
    if (parentPath) {
        ensurePathRendered(parentPath);
        renderChildrenForPath(parentPath);
    }
}

// 切换节点展开/折叠状态
function toggleNode(path) {
    const info = fieldInfoIndex.get(path);
    if (!info || !info.childrenContainer) return;
    
    const isVisible = info.childrenContainer.style.display !== 'none';
    if (!isVisible) {
        renderChildrenForPath(path);
        info.childrenContainer.style.display = 'block';
        expandedPaths.add(path);
    } else {
        info.childrenContainer.style.display = 'none';
        if (path !== 'root') {
            expandedPaths.delete(path);
        }
    }
    
    const toggleIcon = info.element.querySelector('.toggle-icon');
    if (toggleIcon) {
        toggleIcon.textContent = isVisible ? '▶' : '▼';
    }
    
    // 更新可见性以匹配新的展开状态（仅在未处于搜索模式时执行）
    if (searchTerm === '') {
        applyExpansionVisibility();
    } else {
        applySearchFilter();
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

// 计算节点在树列表中的值描述
function computeNodeValueText(value, isObject, isArray) {
    if (!isObject || (isArray && value.length === 0)) {
        return formatValue(value);
    }
    if (isArray) {
        return `Array[${value.length}]`;
    }
    return `Object{${Object.keys(value).length}}`;
}

// 处理搜索
function handleSearch(event) {
    searchTerm = event.target.value.toLowerCase();
    applySearchFilter();
}

// 应用搜索筛选
function applySearchFilter() {
    requestAnimationFrame(() => {
        searchFilteredFields.clear();
        
        if (searchTerm === '') {
            allFieldPaths.forEach(path => {
                searchFilteredFields.add(path);
            });
            clearSearchState();
            applyExpansionVisibility();
            return;
        }
        
        const matchedPaths = new Set();
        nodeMetadataMap.forEach((metadata, path) => {
            if (path === 'root') return;
            const nameMatch = metadata.displayName.toLowerCase().includes(searchTerm);
            const valueMatch = metadata.valueText.toLowerCase().includes(searchTerm);
            if (nameMatch || valueMatch) {
                matchedPaths.add(path);
            }
        });
        
        const pathsToShow = new Set(['root']);
        matchedPaths.forEach(path => {
            pathsToShow.add(path);
            searchFilteredFields.add(path);
            
            let currentPath = path;
            while (parentPathMap.has(currentPath)) {
                currentPath = parentPathMap.get(currentPath);
                pathsToShow.add(currentPath);
                if (currentPath !== 'root') {
                    searchFilteredFields.add(currentPath);
                }
            }
        });
        
        pathsToShow.forEach(path => {
            ensurePathRendered(path);
        });
        
        updateTreeDisplayForSearch(pathsToShow, matchedPaths);
    });
}

// 搜索模式下更新树显示
function updateTreeDisplayForSearch(pathsToShow, matchedPaths) {
    fieldInfoIndex.forEach((info, path) => {
        if (!info.element) return;
        info.element.classList.remove('search-hit');
        info.element.style.display = 'none';
        if (info.childrenContainer) {
            info.childrenContainer.style.display = 'none';
        }
        const toggleIcon = info.element.querySelector('.toggle-icon');
        if (toggleIcon && toggleIcon.textContent !== ' ') {
            toggleIcon.textContent = '▶';
        }
    });
    
    pathsToShow.forEach(path => {
        const info = fieldInfoIndex.get(path);
        if (!info || !info.element) return;
        
        info.element.style.display = '';
        if (matchedPaths.has(path)) {
            info.element.classList.add('search-hit');
        }
        
        if (info.childrenContainer) {
            const children = childPathMap.get(path);
            const hasChildVisible = children ? Array.from(children).some(childPath => pathsToShow.has(childPath)) : false;
            if (hasChildVisible) {
                info.childrenContainer.style.display = 'block';
                const toggleIcon = info.element.querySelector('.toggle-icon');
                if (toggleIcon && toggleIcon.textContent !== ' ') {
                    toggleIcon.textContent = '▼';
                }
            }
        }
    });
}

// 清理搜索模式下的样式和临时显示
function clearSearchState() {
    fieldInfoIndex.forEach((info, path) => {
        if (!info.element) return;
        info.element.classList.remove('search-hit');
    });
}

// 根据展开状态刷新可见节点
function applyExpansionVisibility() {
    fieldInfoIndex.forEach((info, path) => {
        if (!info.element) return;
        const visible = shouldNodeBeVisible(path);
        info.element.style.display = visible ? '' : 'none';
        
        if (info.childrenContainer) {
            const isExpanded = expandedPaths.has(path);
            info.childrenContainer.style.display = isExpanded ? 'block' : 'none';
            const toggleIcon = info.element.querySelector('.toggle-icon');
            if (toggleIcon && toggleIcon.textContent !== ' ') {
                toggleIcon.textContent = isExpanded ? '▼' : '▶';
            }
        }
    });
}

// 判断节点是否应该展示（其所有祖先均已展开）
function shouldNodeBeVisible(path) {
    if (path === 'root') return true;
    const parentPath = parentPathMap.get(path);
    if (!parentPath) return true;
    if (!expandedPaths.has(parentPath)) return false;
    return shouldNodeBeVisible(parentPath);
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