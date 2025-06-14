// DOM元素
const apiKeyInput = document.getElementById('apiKey');
const saveApiKeyBtn = document.getElementById('saveApiKey');
const modelSelect = document.getElementById('modelSelect');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const temperatureSlider = document.getElementById('temperatureSlider');
const temperatureValue = document.getElementById('temperatureValue');
const maxTokensInput = document.getElementById('maxTokensInput');
const presetButtons = document.querySelectorAll('.preset-btn');

// 状态管理
let apiKey = '';
let currentModel = 'deepseek-chat';
let temperature = 1.0;
let maxTokens = 2048;
let conversationHistory = [
    { role: 'assistant', content: '您好！我是 DeepSeek 助手，请设置您的 API 密钥后开始对话。' }
];
let isStreaming = false;
let controller = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 从本地存储加载API密钥
    const savedApiKey = localStorage.getItem('deepseekApiKey');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
        apiKey = savedApiKey;
        sendButton.disabled = false;
    }
    
    // 从本地存储加载模型选择
    const savedModel = localStorage.getItem('deepseekModel');
    if (savedModel) {
        modelSelect.value = savedModel;
        currentModel = savedModel;
    }
    
    // 加载配置
    const savedTemp = localStorage.getItem('deepseekTemperature');
    if (savedTemp) {
        temperature = parseFloat(savedTemp);
        temperatureSlider.value = Math.round(temperature * 10);
        updateTemperatureValue();
    }
    
    const savedTokens = localStorage.getItem('deepseekMaxTokens');
    if (savedTokens) {
        maxTokens = parseInt(savedTokens);
        maxTokensInput.value = maxTokens;
    }
    
    // 自动调整输入框高度
    messageInput.addEventListener('input', autoResizeTextarea);
    
    // 设置事件监听器
    setupEventListeners();
});

// 设置事件监听器
function setupEventListeners() {
    // 保存API密钥
    saveApiKeyBtn.addEventListener('click', saveApiKey);
    
    // 模型选择
    modelSelect.addEventListener('change', changeModel);
    
    // 发送消息
    sendButton.addEventListener('click', sendMessage);
    
    // 输入框事件
    messageInput.addEventListener('keydown', handleKeyDown);
    
    // 温度滑块
    temperatureSlider.addEventListener('input', updateTemperature);
    
    // Max Tokens输入
    maxTokensInput.addEventListener('change', saveMaxTokens);
    
    // 预设按钮
    presetButtons.forEach(btn => {
        btn.addEventListener('click', applyPreset);
    });
}

// 保存API密钥
function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        apiKey = key;
        localStorage.setItem('deepseekApiKey', key);
        sendButton.disabled = false;
        showMessage('API密钥已保存！', 'success');
    } else {
        showMessage('请输入有效的API密钥', 'error');
    }
}

// 更改模型
function changeModel() {
    currentModel = modelSelect.value;
    localStorage.setItem('deepseekModel', currentModel);
    showMessage(`已切换模型: ${getModelName(currentModel)}`, 'info');
}

// 更新温度
function updateTemperature() {
    temperature = temperatureSlider.value / 10;
    updateTemperatureValue();
    localStorage.setItem('deepseekTemperature', temperature.toString());
}

// 更新温度显示
function updateTemperatureValue() {
    temperatureValue.textContent = temperature.toFixed(1);
}

// 保存Max Tokens
function saveMaxTokens() {
    maxTokens = parseInt(maxTokensInput.value);
    if (maxTokens < 100) maxTokens = 100;
    if (maxTokens > 4096) maxTokens = 4096;
    maxTokensInput.value = maxTokens;
    localStorage.setItem('deepseekMaxTokens', maxTokens.toString());
    showMessage(`Max Tokens 设置为: ${maxTokens}`, 'info');
}

// 应用预设
function applyPreset(e) {
    const btn = e.currentTarget;
    const temp = parseFloat(btn.dataset.temp);
    const tokens = parseInt(btn.dataset.tokens);
    
    temperatureSlider.value = temp;
    updateTemperature();
    maxTokensInput.value = tokens;
    saveMaxTokens();
    
    const scenario = btn.textContent.trim();
    showMessage(`已应用 "${scenario}" 预设`, 'success');
}

// 处理按键
function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendButton.disabled && !isStreaming) {
            sendMessage();
        }
    }
    
    // 停止流式输出 (Ctrl+.)
    if (e.ctrlKey && e.key === '.') {
        if (isStreaming && controller) {
            controller.abort();
            showMessage('已停止流式输出', 'info');
        }
    }
}

// 自动调整输入框高度
function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight > 200 ? 200 : messageInput.scrollHeight) + 'px';
}

// 发送消息到DeepSeek API (流式输出)
async function sendMessage() {
    if (isStreaming) return;
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    if (!apiKey) {
        showMessage('请先设置API密钥', 'error');
        return;
    }
    
    // 添加用户消息
    addMessage('user', message);
    conversationHistory.push({ role: 'user', content: message });
    
    // 清空输入框
    messageInput.value = '';
    messageInput.style.height = 'auto';
    messageInput.focus();
    
    // 添加"正在输入"指示器
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'message assistant-message';
    typingIndicator.innerHTML = `
        <div class="message-header">
            <div class="avatar assistant-avatar">AI</div>
            <div class="message-role">DeepSeek ${getModelName(currentModel)}</div>
        </div>
        <div class="message-content">
            <div class="typing-indicator">
                思考中
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(typingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    try {
        // 创建AI消息容器（用于流式输出）
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant-message';
        messageDiv.innerHTML = `
            <div class="message-header">
                <div class="avatar assistant-avatar">AI</div>
                <div class="message-role">DeepSeek ${getModelName(currentModel)}</div>
            </div>
            <div class="message-content"><span class="streaming-text"></span></div>
        `;
        
        // 移除"正在输入"指示器，添加消息容器
        messagesContainer.removeChild(typingIndicator);
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // 获取用于流式输出的元素
        const streamingContent = messageDiv.querySelector('.streaming-text');
        let accumulatedContent = '';
        
        // 设置流式输出状态
        isStreaming = true;
        sendButton.disabled = true;
        sendButton.innerHTML = '<i class="fas fa-stop"></i>';
        sendButton.title = '停止生成 (Ctrl+.)';
        
        // 创建AbortController用于取消请求
        controller = new AbortController();
        
        // 调用流式API
        await callDeepSeekAPIStream(conversationHistory, (contentChunk) => {
            accumulatedContent += contentChunk;
            streamingContent.innerHTML = accumulatedContent;
            
            // 格式化代码块
            formatCodeBlocks(streamingContent);
            
            // 滚动到底部
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, controller.signal);
        
        // 将完整的消息添加到历史记录
        conversationHistory.push({ role: 'assistant', content: accumulatedContent });
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('API调用失败:', error);
            
            // 显示错误消息
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.innerHTML = `
                <strong>错误:</strong> ${error.message || 'API调用失败，请检查API密钥和网络连接'}
            `;
            
            messagesContainer.appendChild(errorMessage);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    } finally {
        // 重置流式输出状态
        isStreaming = false;
        controller = null;
        sendButton.disabled = false;
        sendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
        sendButton.title = '';
    }
}

// 调用DeepSeek API (流式输出)
async function callDeepSeekAPIStream(messages, onChunkReceived, signal) {
    const apiUrl = 'https://api.deepseek.com/chat/completions';
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: currentModel,
            messages: messages,
            temperature: temperature,
            max_tokens: maxTokens,
            stream: true  // 启用流式输出
        }),
        signal: signal
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API请求失败: ${response.status}`);
    }
    
    // 处理流式数据
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = '';
    
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留未完成的行
        
        for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
                const data = line.replace('data: ', '');
                if (data === '[DONE]') {
                    return;
                }
                
                try {
                    const parsed = JSON.parse(data);
                    const contentChunk = parsed.choices[0]?.delta?.content || '';
                    onChunkReceived(contentChunk);
                } catch (err) {
                    console.error('解析错误:', err, line);
                }
            }
        }
    }
}

// 格式化代码块
function formatCodeBlocks(element) {
    const content = element.innerHTML;
    
    // 如果内容中包含代码块，则进行格式化
    if (content.includes('```')) {
        const formattedContent = content.replace(/```(\w+)?\s*([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang || ''}">${escapeHtml(code.trim())}</code></pre>`;
        });
        
        element.innerHTML = formattedContent;
    }
}

// 添加消息到聊天界面（用于非流式消息）
function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}-message`;
    
    const avatarClass = role === 'user' ? 'user-avatar' : 'assistant-avatar';
    const avatarText = role === 'user' ? '你' : 'AI';
    const roleName = role === 'user' ? '你' : `DeepSeek ${getModelName(currentModel)}`;
    
    // 格式化内容
    const formattedContent = formatContent(content);
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar ${avatarClass}">${avatarText}</div>
            <div class="message-role">${roleName}</div>
        </div>
        <div class="message-content">${formattedContent}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 格式化内容
function formatContent(content) {
    // 如果内容中包含代码块，则进行格式化
    if (content.includes('```')) {
        return content.replace(/```(\w+)?\s*([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang || ''}">${escapeHtml(code.trim())}</code></pre>`;
        });
    } else {
        // 普通文本处理换行
        return escapeHtml(content).replace(/\n/g, '<br>');
    }
}

// 显示状态消息
function showMessage(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant-message';
    
    let icon = '';
    let bgColor = '';
    
    switch (type) {
        case 'success':
            icon = '<i class="fas fa-check-circle"></i>';
            bgColor = 'background: #f0fdf4; border-color: #bbf7d0;';
            break;
        case 'error':
            icon = '<i class="fas fa-exclamation-circle"></i>';
            bgColor = 'background: #fef2f2; border-color: #fecaca;';
            break;
        case 'info':
            icon = '<i class="fas fa-info-circle"></i>';
            bgColor = 'background: #eff6ff; border-color: #bfdbfe;';
            break;
    }
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="avatar assistant-avatar">AI</div>
            <div class="message-role">系统提示</div>
        </div>
        <div class="message-content" style="${bgColor}">
            ${icon} ${text}
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// HTML转义
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 获取模型显示名称
function getModelName(model) {
    return model === 'deepseek-chat' 
        ? 'Chat (DeepSeek-V3-0324)' 
        : 'Reasoner (DeepSeek-R1-0528)';
}