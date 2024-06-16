// 在插件启动时运行一次
//organizeTabs();

// 每隔一段时间运行一次，例如每小时
// setInterval(organizeTabs, 60 * 60 * 1000);

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'organize-tabs') {
        organizeTabs().then(() => {
            console.log("通过消息请求组织标签页成功");
            sendResponse({ message: 'Tabs organized successfully!' });
        }).catch(error => {
            console.error('通过消息请求组织标签页时发生错误:', error);
            sendResponse({ message: 'Failed to organize tabs.' });
        });
        return true;
    }
});


// 基于域名的分类规则
const domainRules = [
    // 映射规则的变量
];
//映射规则
let windowRuleMapping = {}; 
// 创建窗口规则映射
async function createWindowRuleMapping() {
    const windows = await chrome.windows.getAll({ populate: false });
    const mapping = {};

    for (const rule of domainRules) {
        mapping[rule.folder] = windows.find(win => win.name === rule.folder)?.id;
    }

    return mapping;
}
async function collectAndAddDomains(tabs) {
    const uniqueDomains = new Set(); // 使用Set来存储唯一域名

    // 收集所有不同的主域名，同时过滤掉空字符串或无效域名
    for (const tab of tabs) {
        const mainDomain = getMainDomain(tab.url);
        if (mainDomain && mainDomain.trim() !== '') { // 确保域名不为空或全为空格
            uniqueDomains.add(mainDomain);
        }
    }

    // 遍历收集到的唯一域名，检查是否已存在于domainRules中，如果不存在则添加
    uniqueDomains.forEach(domain => {
        const existingRule = domainRules.find(rule => rule.domain === domain);
        if (!existingRule) {
            // 自动为新发现的域名创建一个默认的folder名称，采用 "www.domain.com" 格式
            console.log(`发现新域名: ${domain}`);
            
            // 检查域名是否已包含 'www.'，如果不包含则拼接
            const folderName = domain.startsWith('www.') ? domain : `www.${domain}.com`;
            domainRules.push({ domain, folder: folderName });
        }
    });
}
function getMainDomain(url) {
    console.log(`处理URL: ${url}`);
    const domain = new URL(url).hostname;
    
    return domain;
    }

// 获取所有标签页
async function fetchTabs() {
    try {
        console.log("正在获取标签页...");
        const tabs = await chrome.tabs.query({});
        console.log(`共发现 ${tabs.length} 个标签页`);
        return tabs;
    } catch (error) {
        console.error("获取标签页信息时出错:", error);
        throw error; // 重新抛出错误以便上层可以继续处理
    }
}
// 根据规则对标签页进行分类
async function categorizeTabs(tabs, domainRules) {
    for (const tab of tabs) {
        const domain = new URL(tab.url).hostname;
        console.log(`当前标签页域名: ${domain}`);
        
        const matchingRule = domainRules.find((rule) => domain.endsWith(rule.domain));
        if (matchingRule) {
            console.log(`找到匹配规则: ${matchingRule.folder} (对于 ${domain})`);
            await manageTabByRule(tab, matchingRule);
        } else {
            console.log(`未找到匹配规则的域名: ${domain}`);
        }
    }
}
// 查找可复用的窗口ID
// 查找与规则匹配或可复用的窗口ID，并在适当时候建立规则与窗口的关联
async function findAndAssignReusableWindowId(ruleFolder, windowRuleMapping) {
    // 获取所有已分配的窗口ID
    const allWindowsIds = Object.keys(windowRuleMapping);

    // 过滤出未被任何规则占用的窗口ID（这里假设windowRuleMapping的值是规则名，若实际存储的是布尔或其他标识是否占用的值，请调整过滤条件）
    const unassignedWindows = allWindowsIds.filter(id => windowRuleMapping[id] === undefined);

    // 尝试从未分配的窗口中找到一个来关联规则
    for (const windowId of unassignedWindows) {
        // 假设这里有一个逻辑来检查窗口是否真的可复用（例如，检查窗口状态），这里简化处理
        windowRuleMapping[windowId] = ruleFolder; // 关联规则到窗口
        console.log(`窗口ID ${windowId} 未被占用，现分配给规则 "${ruleFolder}"`);
        return windowId;
    }

    // 如果所有窗口都被占用，没有可复用的窗口，根据需求可能需要抛出错误或返回特定值
    console.warn('没有可分配的窗口');
    return null;
}
// 创建新窗口并映射
async function createNewWindowAndMap(folderName) {
    const newWindow = await chrome.windows.create({ state: "maximized" });
    windowRuleMapping[folderName] = newWindow.id;
    console.log(`创建了新窗口: ID ${newWindow.id}`);
    return newWindow.id;
}
// 根据规则管理标签页
async function manageTabByRule(tab, rule) {
    console.log(`开始处理标签页: ID ${tab.id}, 规则: ${JSON.stringify(rule)}`);

    if (!windowRuleMapping) {
        console.log('窗口规则映射尚未创建，开始创建...');
        windowRuleMapping = await createWindowRuleMapping();
        console.log('窗口规则映射创建完成。');
    }

    let windowId = windowRuleMapping[rule.folder];

    if (windowId === undefined) {
        console.log(`未找到与规则 "${rule.folder}" 匹配的窗口，尝试查找可复用窗口...`);
        windowId = await findAndAssignReusableWindowId(rule.folder,windowRuleMapping);
        
        if (windowId === null) {
            console.log('没有可复用的窗口，准备创建新窗口...');
            windowId = await createNewWindowAndMap(rule.folder);
            console.log(`新窗口创建并映射完成: ID ${windowId}`);
        } else {
            console.log(`找到可复用窗口: ID ${windowId}`);
        }
    } else {
        console.log(`找到匹配的窗口: ID ${windowId}`);
    }

    try {
        await chrome.tabs.move(tab.id, { windowId, index: -1 });
        console.log(`标签页移动成功: ID ${tab.id} 到窗口 ID ${windowId}`);
    } catch (moveError) {
        console.error(`移动标签页失败: `, moveError);
    }
}
// 仅查找窗口，不创建新窗口
async function findTargetWindowId(folderName) {
    const windows = await chrome.windows.getAll();
    const targetWindow = windows.find((win) => win.name === folderName);
    
    if (targetWindow) {
        console.log(`找到了目标窗口: ID ${targetWindow.id}`);
        return targetWindow.id;
    } else {
        console.warn(`未找到名为 "${folderName}" 的窗口.`);
        return null; // 或者可以抛出错误，根据您的需求来定
    }
}
// 关闭空白标签页
async function closeBlankTabs() {
    try {
        // 查询所有当前窗口中的标签页
        const allTabs = await chrome.tabs.query({});
        
        // 定义可能的空白标签页 URL 模式
        const blankUrls = [
            'about:blank',
            'chrome://newtab/'
        ];

        // 过滤出那些URL匹配空白标签页模式的标签页
        const blankTabs = allTabs.filter(tab => blankUrls.includes(tab.url));
        
        // 如果有空白标签页，遍历这些空白标签页并关闭它们
        if (blankTabs.length > 0) {
            const tabIds = blankTabs.map(tab => tab.id);
            await chrome.tabs.remove(tabIds);
            console.log(`共关闭了 ${blankTabs.length} 个空白标签页。`);
        } else {
            console.log("没有找到空白标签页。");
        }
    } catch (error) {
        console.error("关闭空白标签页时发生错误:", error);
    }
}
// 组织标签页
async function organizeTabs() {
    console.log("开始组织标签页...");

    try {
        const tabs = await fetchTabs();
        await collectAndAddDomains(tabs); // 假设此函数已定义并正确处理异常
        await categorizeTabs(tabs, domainRules);
    } catch (error) {
        console.error("组织标签页过程中出现错误:", error);
    }
    closeBlankTabs();
    console.log("标签页组织完成");
    console.log("当前窗口规则映射:", domainRules)
}