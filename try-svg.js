(async () => {
    const fs = require("fs-extra")

    const Renderer = require("./src/generator/Renderer")
    const {readSmilesFromCsv} = require("./src/generator/misc")

    const outputDir = "png-data"
    const smilesFile = "molecules.csv"

    const smilesList = await readSmilesFromCsv(smilesFile, 1, 100)
    const renderer = new Renderer(outputDir)
    await renderer.init()

    const xmlFiles = smilesList.map(smiles => renderer.createRawSvgFromSmiles(smiles))

    const infos = await Promise.all(xmlFiles.map(xml => renderer.propertiesFromXmlString(xml)))

    const svgsWithBBs = infos.map(b => renderer.addBoundingBoxesToSvg(b))

    // await Promise.all(svgsWithBBs.map((svg, i) => fs.writeFile(`${outputDir}/svg-bb-${i}.svg`, svg)))

    const n = 5
    let batch = 0
    while (svgsWithBBs.length) {
        const current = svgsWithBBs.splice(0, 5)
        await Promise.all(current.map((svg, i) => renderer.saveAsPngWithProperSize(svg, 8, `${outputDir}/svg-bb-${batch * n + i}.png`)))
        console.log("left:", svgsWithBBs.length)
        ++batch
    }

    await renderer.done()
})()