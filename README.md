This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


# ========== 测试环境（本地开发）==========
# 注册/更新本地 Teams App
teamsapp provision --env local

# 启动本地预览（自动打开 Teams）
lsof -ti:3000 | xargs kill -9

atk preview --env local --run-command "npx next dev --port 3000 --experimental-https --experimental-https-key certificates/localhost-key.pem --experimental-https-cert certificates/localhost.pem"


# ========== 生产环境（Vercel）==========
# 注册/更新生产 Teams App
teamsapp provision --env prod

# 部署代码（push 到 GitHub，Vercel 自动构建）
git push origin main


# ========== Pi Agent 思考模式 ==========
# 以下均为服务端运行时环境变量；未配置时使用右侧默认值
PI_AGENT_MAX_MODEL_TURNS=12
PI_AGENT_MAX_TOOL_CALLS=24
PI_AGENT_MAX_WEB_SEARCHES=5

# 通用文本文件工具
FILE_AGENT_MAX_FILE_BYTES=1073741824
FILE_AGENT_MAX_TOOL_RESULT_BYTES=51200
FILE_AGENT_MAX_MATCHES=100
FILE_AGENT_MAX_LINE_CHARS=500
FILE_AGENT_READ_CHUNK_BYTES=32768
FILE_AGENT_MAX_STRUCTURED_PARSE_BYTES=104857600
