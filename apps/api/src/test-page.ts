// 最小 SSE 打字机测试页，由 worker 同源托管（免 CORS）。仅用于本地联调。
// 注意：解析 SSE 时不要 trim data 行，否则会丢掉增量里的空格。
export const TEST_PAGE = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI 陪伴 · 流式测试</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.6 system-ui, -apple-system, "PingFang SC", sans-serif; background: #f6f7f9; color: #1c1d21; }
  .wrap { max-width: 680px; margin: 0 auto; height: 100dvh; display: flex; flex-direction: column; }
  header { padding: 14px 18px; border-bottom: 1px solid #e6e7ea; background: #fff; }
  header b { font-size: 16px; }
  header span { color: #8a8d96; font-size: 12px; margin-left: 8px; }
  #log { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
  .msg { max-width: 78%; padding: 9px 13px; border-radius: 14px; white-space: pre-wrap; word-break: break-word; }
  .msg.user { align-self: flex-end; background: #2f6df6; color: #fff; border-bottom-right-radius: 4px; }
  .msg.assistant { align-self: flex-start; background: #fff; border: 1px solid #e6e7ea; border-bottom-left-radius: 4px; }
  .msg.assistant.empty::after { content: "···"; color: #b3b6bd; }
  footer { padding: 12px; border-top: 1px solid #e6e7ea; background: #fff; display: flex; gap: 8px; }
  textarea { flex: 1; resize: none; height: 44px; padding: 10px 12px; border: 1px solid #d6d8dd; border-radius: 10px; font: inherit; }
  button { padding: 0 18px; border: 0; border-radius: 10px; background: #2f6df6; color: #fff; font: inherit; cursor: pointer; }
  button:disabled { background: #aab4c6; cursor: not-allowed; }
</style>
</head>
<body>
<div class="wrap">
  <header><b>小雨</b><span>test-user · test-agent · DeepSeek 流式</span></header>
  <div id="log"></div>
  <footer>
    <textarea id="input" placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"></textarea>
    <button id="send">发送</button>
  </footer>
</div>
<script>
  var logEl = document.getElementById('log');
  var inputEl = document.getElementById('input');
  var sendEl = document.getElementById('send');

  function bubble(role) {
    var d = document.createElement('div');
    d.className = 'msg ' + role;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    return d;
  }

  function stripCR(line) { return line.charAt(line.length - 1) === '\\r' ? line.slice(0, -1) : line; }

  async function send() {
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendEl.disabled = true;
    bubble('user').textContent = text;
    var a = bubble('assistant');
    a.classList.add('empty');

    var body = {
      messages: [{ role: 'user', content: text }],
      conversation: {
        id: 'test-agent', name: '小雨', handle: '@xiaoyu', headline: '日常陪伴',
        lastActive: '刚刚', status: '在线', relationship: 'comfortable_chat', topic: '职业',
        chemistry: '72', chemistryLabel: '心动', rhythm: '自然', profileNote: '温柔体贴的陪伴助手'
      }
    };

    try {
      var res = await fetch('/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'test-user' },
        body: JSON.stringify(body)
      });
      if (!res.ok || !res.body) { a.classList.remove('empty'); a.textContent = '[错误] HTTP ' + res.status; return; }

      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = '';
      var evt = '';
      while (true) {
        var r = await reader.read();
        if (r.done) break;
        buf += dec.decode(r.value, { stream: true });
        var lines = buf.split('\\n');
        buf = lines.pop() || '';
        for (var i = 0; i < lines.length; i++) {
          var line = stripCR(lines[i]);
          if (line.indexOf('event:') === 0) { evt = line.slice(6).trim(); continue; }
          if (line.indexOf('data:') === 0) {
            var data = line.slice(5);
            if (data.charAt(0) === ' ') data = data.slice(1); // SSE 单个分隔空格
            if (evt === 'delta') { a.classList.remove('empty'); a.textContent += data; logEl.scrollTop = logEl.scrollHeight; }
            else if (evt === 'error') { a.classList.remove('empty'); a.textContent += ' [错误] ' + data; }
          }
        }
      }
      a.classList.remove('empty');
    } catch (e) {
      a.classList.remove('empty');
      a.textContent = '[异常] ' + e;
    } finally {
      sendEl.disabled = false;
      inputEl.focus();
    }
  }

  sendEl.onclick = send;
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
</script>
</body>
</html>`
