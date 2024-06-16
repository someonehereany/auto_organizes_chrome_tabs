document.getElementById('organizeBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'organize-tabs' }, (response) => {
        console.log(response.message);
    });
});