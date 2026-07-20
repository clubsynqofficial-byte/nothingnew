import { chromium } from 'playwright'

const SNAP_DIR = '/tmp/claude-1000/-home-abhxy-Desktop-spap2/018818e0-ccbf-4fc8-b7ca-47692521f11a/scratchpad'
const TID = 'a0d68c26-a354-43da-b01d-19ce44c35cbf'

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', msg => console.log('[page console]', msg.type(), msg.text()))
page.on('pageerror', err => console.log('[pageerror]', err.message))
page.on('websocket', ws => {
  console.log('[websocket opened]', ws.url())
  ws.on('framesent', f => console.log('[ws sent]', typeof f.payload === 'string' ? f.payload.slice(0, 200) : '<binary>'))
  ws.on('framereceived', f => console.log('[ws recv]', typeof f.payload === 'string' ? f.payload.slice(0, 300) : '<binary>'))
  ws.on('close', () => console.log('[websocket closed]', ws.url()))
  ws.on('socketerror', err => console.log('[websocket error]', err))
})

await page.goto(`http://localhost:5173/tournaments/${TID}/scoreboard`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(20000)
await browser.close()
