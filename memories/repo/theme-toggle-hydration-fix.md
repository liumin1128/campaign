# 主题切换按钮 Hydration 修复

## 问题
- `useThemeMode()` 在 SSR 时默认为 `"light"`，但客户端 hydrate 时读取 `localStorage` 中存储的 `"dark"`，导致 HTML 不一致，抛出 hydration 错误。
- 具体表现为：服务端渲染月亮图标（浅色模式），客户端 hydrate 时立即切换为太阳图标（深色模式），aria-label/title 和 SVG 内容均不匹配。

## 解决方案
- 使用 `useEffect` + `mounted` 状态延迟主题相关内容的渲染：
  1. 初始 `mounted = false`，服务端和首次客户端渲染均渲染一致的占位图标（太阳）
  2. `useEffect` 在客户端 mount 后设置 `mounted = true`
  3. 第二次渲染时根据 `computedMode` 显示正确图标
- `aria-label` 和 `title` 同样通过 `mounted` 条件判断，避免 hydration 不匹配。
- 占位图标使用太阳 SVG，保持尺寸一致，防止布局偏移。

## 关键代码模式
```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);

return (
  <button aria-label={mounted ? actualLabel : "切换主题"}>
    {mounted ? (isDark ? <SunIcon /> : <MoonIcon />) : <PlaceholderIcon />}
  </button>
);
```
