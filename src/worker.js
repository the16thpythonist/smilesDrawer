const Renderer = require('./generator/Renderer')
const puppeteer = require('puppeteer')

process.on('message', async({ conf, smilesList, browserOptions }) => {
  const browser = await puppeteer.launch(browserOptions)
  const renderer = new Renderer(conf)
  const page = await browser.newPage()
  process.send({ browserPid: browser.process().pid })

  for (const smiles of smilesList) {
    try {
      await renderer.imageFromSmilesString(page, smiles)
    } catch (e) {
      console.error(`PID ${process.pid}: failed to process SMILES string '${smiles}'`, e.message)
    }
  }

  await page.close()
  await browser.close()
  process.exit(0)
})
