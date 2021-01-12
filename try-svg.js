(async () => {
    const fs = require('fs-extra')
    const puppeteer = require('puppeteer');

    const {
        saveAsPngWithProperSize, propertiesFromXmlString, createRawSvgFromSmiles, addBoundingBoxesToSvg
    } = require("./src/generator/svg")

    const browser = await puppeteer.launch({headless: true, devtools: false});

    const {readSmilesFromCsv} = require("./src/generator/misc")

    const outputDir = "png-data"
    if (! await fs.exists(outputDir)) {
        await fs.mkdir(outputDir)
    }

    const smilesFile = "molecules.csv"
    const smilesList = await readSmilesFromCsv(smilesFile, 1, 10)
    const xmlFiles = smilesList.map(createRawSvgFromSmiles)

    const infos = await Promise.all(xmlFiles.map(xml => propertiesFromXmlString(browser, xml)))

    const svgsWithBBs = infos.map(b => addBoundingBoxesToSvg(b))

    // await Promise.all(svgsWithBBs.map((svg, i) => fsP.writeFile(`${outputDir}/svg-bb-${i}.svg`, svg)))

    await Promise.all(svgsWithBBs.map((svg, i) => saveAsPngWithProperSize(browser, svg, 1000, `${outputDir}/svg-bb-${i}.png`)))

    await browser.close()
})()