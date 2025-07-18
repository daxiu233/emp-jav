// ==UserScript==
// @name          EMP-JAV上传助手
// @namespace     https://www.empornium.is/
// @version       3.5.2
// @description   输入番号抓取JavBus信息，自动翻译填表。提供JavBus封面纯链接复制，和本地封面文件上传到Hamster图床（BBCode复制）。支持JavBus封面直接二进制转存到Hamster。
// @author        雪王
// @match         https://www.empornium.is/upload.php*
// @grant         GM_xmlhttpRequest
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_setClipboard
// @connect       www.javbus.com
// @connect       r18.dev
// @connect       translate.google.com
// @connect       hamster.is
// ==/UserScript==

(function () {
    'use strict';

    // =========== 常量和页面元素 ===========
    const TITLE_INPUT_NAME = 'title';
    const TAG_INPUT_ID = 'taginput';
    const DESCRIPTION_INPUT_ID = 'desc';
    const COVER_INPUT_NAME = 'image'; // 封面图片输入框的name，现在将自动填充
    const JAVBUS_DOMAIN = 'https://www.javbus.com'; // 明确的JavBus主域名
    const R18_DOMAIN = 'https://r18.dev';
    const HAMSTER_UPLOAD_URL = 'https://hamster.is/api/1/upload';

    const titleInput = document.querySelector(`input[name="${TITLE_INPUT_NAME}"]`);
    if (!titleInput) return; // 如果找不到标题输入框，则脚本不执行

    const descriptionInput = document.getElementById(DESCRIPTION_INPUT_ID);
    const tagInput = document.getElementById(TAG_INPUT_ID);
    const coverInput = document.querySelector(`input[name="${COVER_INPUT_NAME}"]`); // 封面输入框，现在将自动填充

    // =========== 状态提示框 ===========
    let statusBox = document.getElementById('eb-status-box');
    if (!statusBox) {
        statusBox = document.createElement('div');
        statusBox.id = 'eb-status-box';
        statusBox.style = `
            position: fixed; top: 10px; left: 10px; background: #282c34; color: #fff;
            padding: 8px 15px; font-size: 14px; font-family: 'Segoe UI', sans-serif;
            z-index: 99999; border-radius: 5px; opacity: 0.95; max-width: 300px;
            word-break: break-word; box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            transition: color 0.3s, background-color 0.3s;
        `;
        document.body.appendChild(statusBox);
    }

    function updateStatus(text, type = 'info') {
        const colors = {
            info: '#90caf9',    // 蓝色
            success: '#a5d6a7', // 绿色
            warning: '#ffe082', // 黄色
            error: '#ef9a9a',   // 红色
            special: '#ce93d8'  // 紫色
        };
        statusBox.textContent = text;
        statusBox.style.color = colors[type] || colors.info;
        console.log(`[状态: ${type}]`, text);
    }
    updateStatus('脚本已加载，等待操作...');


    // =========== API Key 管理 ===========
    const API_KEY_STORAGE = "hamster_api_key";

    async function getApiKey() {
        return await GM_getValue(API_KEY_STORAGE, null);
    }

    async function setApiKey() {
        const currentKey = await getApiKey();
        const newKey = prompt('请输入你的 Hamster API Key:', currentKey || '');
        if (newKey && newKey.trim() !== "") {
            await GM_setValue(API_KEY_STORAGE, newKey.trim());
            updateStatus('API Key 已保存!', 'success');
        } else if (newKey === "") {
             await GM_setValue(API_KEY_STORAGE, null);
             updateStatus('API Key 已清除。', 'warning');
        } else {
            updateStatus('API Key 设置已取消。', 'info');
        }
    }


    // =========== 创建UI (输入框和按钮) ===========
    function createUI() {
        if (document.getElementById('eb-container')) return;

        const container = document.createElement('div');
        container.id = 'eb-container';
        container.style.margin = '5px 0';

        const codeInput = document.createElement('input');
        codeInput.id = 'eb-code-input';
        codeInput.placeholder = '输入番号 (例: SONE-711)';
        codeInput.style = 'margin-left: 8px; width: 150px;';

        const btnFetchInfo = document.createElement('button');
        btnFetchInfo.type = 'button'; // 防止触发表单提交
        btnFetchInfo.id = 'eb-btn-fetch-info';
        btnFetchInfo.textContent = '获取信息';
        btnFetchInfo.style.marginLeft = '4px';

        const btnCopyCoverLinkAndUpload = document.createElement('button'); // 新按钮，明确功能
        btnCopyCoverLinkAndUpload.type = 'button';
        btnCopyCoverLinkAndUpload.id = 'eb-btn-copy-javbus-cover-upload';
        btnCopyCoverLinkAndUpload.textContent = 'JavBus封面图转存并填充 (Direct link)'; // Updated text
        btnCopyCoverLinkAndUpload.style.marginLeft = '4px';
        btnCopyCoverLinkAndUpload.title = '从JavBus获取封面大图，直接上传到Hamster图床，并自动填充封面框及复制Hamster的BBCode链接到剪贴板';

        // 新增：用于选择本地文件的隐藏input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'eb-local-cover-upload-input';
        fileInput.accept = 'image/*'; // 只接受图片文件
        fileInput.style.display = 'none'; // 隐藏起来，通过按钮触发

        // 新增：触发本地文件选择的按钮
        const btnUploadLocalCover = document.createElement('button');
        btnUploadLocalCover.type = 'button';
        btnUploadLocalCover.id = 'eb-btn-upload-local-cover';
        btnUploadLocalCover.textContent = '上传本地封面到简介 (BBCode)'; // Button text implies BBCode
        btnUploadLocalCover.style.marginLeft = '4px';
        btnUploadLocalCover.title = '选择本地图片文件并上传到Hamster图床，生成BBCode链接追加到简介框，并复制BBCode链接到剪贴板';

        const btnSettings = document.createElement('button');
        btnSettings.type = 'button';
        btnSettings.id = 'eb-btn-settings';
        btnSettings.textContent = '设置';
        btnSettings.style.marginLeft = '4px';
        btnSettings.title = '设置 Hamster API Key (上传本地封面需要)';

        container.append(codeInput, btnFetchInfo, btnCopyCoverLinkAndUpload, btnUploadLocalCover, fileInput, btnSettings);
        titleInput.parentNode.insertBefore(container, titleInput.nextSibling);

        // --- 绑定事件 ---
        btnFetchInfo.addEventListener('click', fetchAndFillInfo);
        btnCopyCoverLinkAndUpload.addEventListener('click', fetchJavBusCoverAndUploadToHamster); // Bind to new function
        btnUploadLocalCover.addEventListener('click', () => fileInput.click()); // Click button to trigger file selection
        fileInput.addEventListener('change', uploadLocalCoverFile); // Execute upload after file selection
        btnSettings.addEventListener('click', setApiKey);
    }
    createUI();


    // =========== 网络请求核心 (Promise封装) ===========
    function gmRequest(details) {
        return new Promise((resolve, reject) => {
            details.onload = (response) => {
                if (response.status >= 200 && response.status < 400) {
                    // For HTML response, print beginning; for binary response, do not print
                    if (response.responseType !== 'blob' && response.responseText) {
                        console.log(`[调试信息] GM_xmlhttpRequest 成功响应文本开头 (${response.responseText.length} 字符, URL: ${details.url}):`, response.responseText.substring(0, 500) + (response.responseText.length > 500 ? '...' : ''));
                    } else {
                        console.log(`[调试信息] GM_xmlhttpRequest 成功响应 (${response.responseType}, URL: ${details.url})`);
                    }
                    resolve(response);
                } else {
                    reject(new Error(`请求失败，状态码: ${response.status}${response.status === 403 ? ' (可能因防盗链被拒绝)' : ''}`));
                }
            };
            details.onerror = (error) => {
                console.error(`[调试信息] GM_xmlhttpRequest 请求错误，URL: ${details.url}`, error);
                reject(new Error('网络请求错误'));
            };
            details.ontimeout = () => {
                console.warn(`[调试信息] GM_xmlhttpRequest 请求超时，URL: ${details.url}`);
                reject(new Error('请求超时'));
            };
            GM_xmlhttpRequest(details);
        });
    }

    // =========== 带进度条的网络请求核心 (Promise封装) ===========
    function gmRequestWithProgress(details, progressPrefix = "") {
        return new Promise((resolve, reject) => {
            details.onload = (response) => {
                if (response.status >= 200 && response.status < 400) {
                    console.log(`[调试信息] GM_xmlhttpRequest 成功响应 (${details.responseType}, URL: ${details.url})`);
                    resolve(response);
                } else {
                    reject(new Error(`请求失败，状态码: ${response.status}${response.status === 403 ? ' (可能因防盗链被拒绝)' : ''}`));
                }
            };
            details.onerror = (error) => {
                console.error(`[调试信息] GM_xmlhttpRequest 请求错误，URL: ${details.url}`, error);
                reject(new Error('网络请求错误'));
            };
            details.ontimeout = () => {
                console.warn(`[调试信息] GM_xmlhttpRequest 请求超时，URL: ${details.url}`);
                reject(new Error('请求超时'));
            };
            details.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    updateStatus(`${progressPrefix} ${percent}%...`, 'info');
                } else {
                    updateStatus(`${progressPrefix} (未知进度)...`, 'info');
                }
            };
            details.onuploadprogress = (e) => { // File upload progress
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    updateStatus(`${progressPrefix} ${percent}%...`, 'info');
                } else {
                    updateStatus(`${progressPrefix} (未知进度)...`, 'info');
                }
            };

            GM_xmlhttpRequest(details);
        });
    }


    // =========== HTML解析器 ===========
    const parser = new DOMParser();

    // =========== 主要逻辑函数 ===========

    /**
     * 主函数：获取并填充所有文本信息
     */
    async function fetchAndFillInfo() {
        const codeInput = document.getElementById('eb-code-input');
        const code = codeInput.value.trim().toUpperCase();
        if (!code) {
            updateStatus('请输入番号!', 'warning');
            return;
        }

        try {
            updateStatus(`正在请求 JavBus: ${code}...`, 'info');
            const javbusUrl = `${JAVBUS_DOMAIN}/${code.startsWith('CENSORED') ? '' : 'en/'}${code}`;
            const javbusRes = await gmRequest({ method: 'GET', url: javbusUrl });

            // --- 增强诊断：检查原始响应文本是否包含 JavBus 特征 ---
            if (!javbusRes.responseText.includes('JAVBUS') && !javbusRes.responseText.includes('avmoo') && !javbusRes.responseText.includes('javbus.com')) {
                throw new Error(`获取到的内容似乎不是 JavBus 页面，请检查网络或浏览器设置。` +
                                `请按F12打开控制台查看 "GM_xmlhttpRequest 响应文本开头" 判断实际收到的内容。`);
            }
            // --- 增强诊断结束 ---

            const javbusDoc = parser.parseFromString(javbusRes.responseText, 'text/html');

            // --- 诊断性检查：确认是否成功获取到JavBus页面 ---
            if (!javbusDoc.URL.includes(JAVBUS_DOMAIN) && !javbusDoc.title.includes('JavBus')) {
                throw new Error('解析后的页面URL或标题不是 JavBus。请检查控制台获取到的原始HTML内容。');
            }
            // --- 诊断性检查结束 ---


            if (javbusDoc.title.includes('404 Not Found') || javbusDoc.body.textContent.includes('not found')) {
                throw new Error(`在 JavBus 上找不到番号: ${code}`);
            }

            // 1. 获取并翻译标题
            const rawTitle = javbusDoc.querySelector('h3')?.textContent || '';
            if (!rawTitle) throw new Error('无法从 JavBus 页面找到标题');
            updateStatus('成功获取标题，正在翻译...', 'success');
            const translatedTitle = await translateText(rawTitle);
            titleInput.value = `[${code}] ${translatedTitle.replace(new RegExp(`^${code}\\s*`, 'i'), '').replace(/\s*-\s*JavBus\s*$/i, '')}`;
            updateStatus('标题填充完毕!', 'success');

            // Using standard JS methods to find elements, replacing invalid :contains() selector
            const allHeaders = javbusDoc.querySelectorAll('.header');
            let rawDescription = '';
            let studio = '';

            for (const header of allHeaders) {
                const headerText = header.textContent || '';
                if (headerText.includes('Summary')) {
                   const pElement = header.nextElementSibling;
                   if (pElement && pElement.tagName === 'P') {
                        rawDescription = pElement.textContent.trim();
                   }
                }
                if (headerText.includes('Studio')) {
                    const pElement = header.nextElementSibling;
                    if (pElement && pElement.tagName === 'P' && pElement.querySelector('a')) {
                        studio = pElement.querySelector('a').textContent.toLowerCase().trim().replace(/\s+/g, '.');
                    }
                }
            }

            // 2. Get and translate description
            updateStatus('正在提取简介...', 'info');
            if (rawDescription) {
                const translatedDescription = await translateText(rawDescription);
                descriptionInput.value = translatedDescription;
                updateStatus('简介填充完毕!', 'success');
            } else {
                updateStatus('未找到简介信息。', 'warning');
            }

            // 3. Extract JavBus tags
            let tags = new Set();
            tags.add(code.toLowerCase().replace(/-/g, '.')); // Add code itself

            const actor = javbusDoc.querySelector('.star-name a')?.textContent.toLowerCase().trim().replace(/\s+/g, '.');
            if(actor) tags.add(actor);

            if(studio) tags.add(studio); // Add Studio acquired from the fixed logic above

            javbusDoc.querySelectorAll('.genre a').forEach(el => {
                const tag = el.textContent.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '.');
                if (tag) tags.add(tag);
            });
            updateStatus('JavBus 标签提取完毕。', 'success');

            // 4. Get R18 tags and merge
            updateStatus('正在尝试从 R18.dev 获取补充标签...', 'info');
            try {
                const r18Tags = await fetchR18Tags(code);
                r18Tags.forEach(tag => tags.add(tag));
                updateStatus('R18 标签合并完毕!', 'success');
            } catch (r18Error) {
                updateStatus(r18Error.message, 'warning');
            }

            // 5. Add default tags and populate
            const finalTags = Array.from(tags);
            const fallback = ['1080p', 'japanese', 'hd', 'asian', 'full.hd', 'censored'];
            for (const f of fallback) {
                if (finalTags.length >= 8) break;
                if (!finalTags.includes(f)) finalTags.push(f);
            }
            tagInput.value = finalTags.slice(0, 8).join(',');
            updateStatus('所有信息填充完成!', 'special');

        } catch (error) {
            updateStatus(`错误: ${error.message}`, 'error');
        }
    }


    /**
     * New function: Fetches cover image from JavBus and directly uploads to Hamster image host
     */
    async function fetchJavBusCoverAndUploadToHamster() {
        const codeInput = document.getElementById('eb-code-input');
        const code = codeInput.value.trim().toUpperCase();
        if (!code) {
            updateStatus('请输入番号!', 'warning');
            return;
        }

        const apiKey = await getApiKey();
        if (!apiKey) {
            updateStatus('请先点击"设置"配置 Hamster API Key 才能上传图片!', 'warning');
            return;
        }

        try {
            updateStatus(`正在获取 ${code} 的JavBus页面信息...`, 'info');
            const javbusUrl = `${JAVBUS_DOMAIN}/${code.startsWith('CENSORED') ? '' : 'en/'}${code}`;
            const javbusRes = await gmRequest({ method: 'GET', url: javbusUrl });

            // Enhanced diagnosis: check if raw response text contains JavBus features
            if (!javbusRes.responseText.includes('JAVBUS') && !javbusRes.responseText.includes('avmoo') && !javbusRes.responseText.includes('javbus.com')) {
                throw new Error(`获取到的内容似乎不是 JavBus 页面，请检查网络或浏览器设置。`);
            }
            const javbusDoc = parser.parseFromString(javbusRes.responseText, 'text/html');
            if (!javbusDoc.URL.includes(JAVBUS_DOMAIN) && !javbusDoc.title.includes('JavBus')) {
                throw new Error('解析后的页面URL或标题不是 JavBus。');
            }

            let extractedCoverLink = ''; // Use a new variable for extracted raw link
            const bigImageLinkElement = javbusDoc.querySelector('a.bigImage');
            if (bigImageLinkElement) {
                const imgElement = bigImageLinkElement.querySelector('img');
                if (imgElement && imgElement.src) {
                    extractedCoverLink = imgElement.src;
                } else if (bigImageLinkElement.href) {
                    extractedCoverLink = bigImageLinkElement.href;
                }
            } else {
                const magnetShowImg = javbusDoc.querySelector('#magnet-show img');
                if (magnetShowImg && magnetShowImg.src) {
                    extractedCoverLink = magnetShowImg.src;
                }
            }

            if (!extractedCoverLink) {
                throw new Error('无法找到封面大图链接。');
            }

            console.log(`[调试信息] 从JavBus HTML中原始提取的封面链接: ${extractedCoverLink}`);

            // === 最终、最强制的图片URL修正逻辑 (简化并增强文件名提取) ===
            let fullCoverUrl = '';
            const filenameMatch = extractedCoverLink.match(/\/([^/]+\.(?:jpg|jpeg|png|gif|webp|bmp|tiff))(?:\?.*)?$/i);

            if (filenameMatch && filenameMatch[1]) {
                // 如果能从任何复杂的URL中提取到文件名，就直接拼接到 JavBus 域名下默认的 /pics/cover/ 路径
                fullCoverUrl = `${JAVBUS_DOMAIN}/pics/cover/${filenameMatch[1]}`;
            } else {
                // 实在无法提取文件名，则尝试使用 JavBus 域名作为基础解析
                try {
                    const javbusDomainParsed = new URL(JAVBUS_DOMAIN);
                    const parsedCoverLink = new URL(extractedCoverLink, javbusDomainParsed.origin);
                    fullCoverUrl = `${javbusDomainParsed.protocol}//${javbusDomainParsed.host}${parsedCoverLink.pathname}`;
                } catch (urlError) {
                    throw new Error(`无法从JavBus页面解析出有效的封面图片URL: ${extractedCoverLink} (文件名也无法提取)。`);
                }
            }
            // === 修正逻辑结束 ===

            // Final check to ensure the domain is correct
            if (!fullCoverUrl.includes(new URL(JAVBUS_DOMAIN).host)) {
                throw new Error(`生成的封面链接仍然不是 JavBus 域名：${fullCoverUrl}。`);
            }
            console.log(`[调试信息] 最终用于下载的封面URL (强制修正并验证后): ${fullCoverUrl}`);


            updateStatus('正在下载 JavBus 封面图片...', 'info');
            const imageResponse = await gmRequestWithProgress({
                method: 'GET',
                url: fullCoverUrl,
                responseType: 'blob',
                headers: {
                    'Referer': javbusUrl
                }
            }, '下载封面');
            console.log('[调试信息] 封面图片二进制数据下载完成。'); // New log here

            const imageBlob = imageResponse.response;
            const filename = fullCoverUrl.split('/').pop() || `${code}_cover.jpg`;
            const fileType = imageBlob.type || 'image/jpeg';
            const imageFile = new File([imageBlob], filename, { type: fileType });

            updateStatus('开始上传封面到 Hamster 图床...', 'info');
            const uploadedUrl = await uploadToHamster(imageFile, apiKey, '上传封面'); // Get uploaded URL
            console.log('[调试信息] 封面图片已上传至 Hamster。'); // New log here

            // === New: Auto-fill cover input field ===
            if (coverInput && uploadedUrl) {
                coverInput.value = uploadedUrl;
                updateStatus('封面框已自动填充!', 'success');
            }
            // === End New ===

            updateStatus('JavBus封面已成功转存到Hamster并复制BBCode链接!', 'success');

        } catch (error) {
            updateStatus(`JavBus封面转存失败: ${error.message}`, 'error');
        }
    }


    /**
     * Uploads file to Hamster.is and outputs BBCode to clipboard
     * This function is now shared by fetchJavBusCoverAndUploadToHamster and uploadLocalCoverFile
     */
    async function uploadToHamster(file, apiKey, progressPrefix = "上传") {
        updateStatus(`${progressPrefix}到 Hamster 图床中...`, 'info');

        const formData = new FormData();
        formData.append('source', file);

        try {
            const uploadRes = await gmRequestWithProgress({
                method: 'POST',
                url: HAMSTER_UPLOAD_URL,
                headers: { 'X-API-Key': apiKey },
                data: formData,
            }, progressPrefix);

            const uploadJson = JSON.parse(uploadRes.responseText);
            const uploadedUrl = uploadJson?.image?.url || uploadJson?.display_url;
            if (!uploadedUrl) {
                throw new Error('上传成功，但无法从返回数据中找到有效图片URL。');
            }

            const bbCodeUrl = `[img]${uploadedUrl}[/img]`;

            GM_setClipboard(bbCodeUrl); // Copy BBCode to clipboard
            return uploadedUrl; // Return uploaded URL for future use
        } catch (error) {
            if (error.message && error.message.includes("请求失败，状态码:")) {
                try {
                    const errorJson = JSON.parse(error.message.split(' (可能因防盗链被拒绝)')[0].split(': ')[1]);
                    if (errorJson && errorJson.message) {
                        throw new Error(`上传失败: ${errorJson.message}`);
                    }
                } catch (parseError) {
                    // ignore parse error, use original message
                }
            }
            throw new Error(`Hamster 图床上传失败: ${error.message}`);
        }
    }

    /**
     * New function: Uploads local file to Hamster.is and outputs BBCode to description box and clipboard
     */
    async function uploadLocalCoverFile(event) {
        const file = event.target.files[0]; // Get the first file selected by the user
        if (!file) {
            updateStatus('未选择文件。', 'warning');
            return;
        }

        const apiKey = await getApiKey();
        if (!apiKey) {
            updateStatus('请先点击"设置"配置 Hamster API Key 才能上传本地文件!', 'warning');
            return;
        }

        updateStatus(`正在上传本地文件: ${file.name}...`, 'info');

        try {
            const uploadedUrl = await uploadToHamster(file, apiKey, `上传本地文件`); // Get uploaded URL
            const bbCodeUrl = `[img]${uploadedUrl}[/img]`;
            console.log('[调试信息] 本地图片已上传至 Hamster。'); // New log here

            // === New: Auto-append BBCode to description box ===
            if (descriptionInput && bbCodeUrl) {
                const currentDesc = descriptionInput.value.trim();
                descriptionInput.value = currentDesc ? `${currentDesc}\n\n${bbCodeUrl}` : bbCodeUrl;
                updateStatus('BBCode 已追加到简介框!', 'success');
            }
            // === End New ===

            updateStatus('本地封面上传成功! BBCode 链接已复制。', 'success');
        } catch (error) {
            updateStatus(`本地封面上传失败: ${error.message}`, 'error');
        }
    }


    /**
     * Helper function: Fetches tags from R18.dev
     */
    async function fetchR18Tags(code) {
        try {
            const r18Url = `${R18_DOMAIN}/videos/vod/movies/detail/-/id=${code.toLowerCase()}/`;
            const res = await gmRequest({ method: 'GET', url: r18Url });
            const doc = parser.parseFromString(res.responseText, 'text/html');
            if (doc.title.includes('Error')) return [];

            const tags = new Set();
            doc.querySelectorAll('ul.movie-detail-list-item a[href*="/genres/"]').forEach(el => {
                const tag = el.textContent.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '.');
                if(tag) tags.add(tag);
            });
            return Array.from(tags);
        } catch (error) {
            throw new Error('请求 R18.dev 失败，跳过补充标签。');
        }
    }

    /**
     * Helper function: Translates text
     */
    async function translateText(text) {
        if (!text) return "";
        const url = `https://translate.google.com/m?sl=auto&tl=en&q=${encodeURIComponent(text)}`;
        try {
            const res = await gmRequest({ method: 'GET', url });
            const doc = parser.parseFromString(res.responseText, 'text/html');
            const translated = doc.querySelector('.result-container')?.textContent || text;
            return translated.trim();
        } catch (error) {
            updateStatus('翻译失败，将使用原文。', 'warning');
            return text; // Return original text if translation fails
        }
    }

})();