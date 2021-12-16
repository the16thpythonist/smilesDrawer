const Renderer = require('./generator/Renderer')
const treekill = require('tree-kill')
const puppeteer = require('puppeteer')

process.on('message', async({ conf, smilesList, browserOptions }) => {
  const browser = await puppeteer.launch(browserOptions)
  const renderer = new Renderer(conf)
  const page = await browser.newPage()

  for (const smiles of smilesList) {
    try {
      await renderer.imageFromSmilesString(page, smiles)
    } catch (e) {
      console.error(`PID ${process.pid}: failed to process SMILES string '${smiles}'`, e.message)
    }
  }

  await page.close()

  // aneb: docs say chrome may spawn child process, kill them
  // https://docs.browserless.io/blog/2019/03/13/more-observations.html
  await browser.close()
  await browser.disconnect()
  treekill(browser.process().pid, 'SIGKILL')
  process.exit(0)
})
