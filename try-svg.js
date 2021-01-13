(async () => {
  // TODO
  // TODO curate list of interesting test SMILES
  // TODO add conversion for ring vs double bond drawing
  // TODO add color setting, try to emulate "paper" style with bad quality
  // TODO try outputting images with lower quality

  const fs = require('fs-extra')
  const path = require('path')
  const Renderer = require('./src/generator/Renderer')
  const { readSmilesFromCsv } = require('./src/generator/misc')

  // const [smilesFile, column, filePrefix] = ['data/molecules.csv', 1, 'fullerenes']
  // const [smilesFile, column, filePrefix] = ['data/zinc_250k.csv', 0, 'zinc']
  const [smilesFile, column, filePrefix] = ['data/drugbank.csv', 0, 'drugbank']

  const outputDir = path.resolve(`png-data/${filePrefix}`)
  let smilesList = await readSmilesFromCsv(smilesFile, column, 100)
  smilesList = [
    smilesList[0],
    smilesList[0].replace(/C/g, 'c')
  ]

  const renderer = new Renderer(outputDir)
  await renderer.init()

  const batchSize = 20
  let batch = 0

  while (smilesList.length) {
    const smilesBatch = smilesList.splice(0, batchSize)
    const xmlFiles = smilesBatch.map(smiles => renderer.createRawSvgFromSmiles(smiles))

    const infos = await Promise.all(xmlFiles.map(xml => renderer.propertiesFromXmlString(xml)))
    const svgsWithBBs = infos.map(b => renderer.addBoundingBoxesToSvg(b))

    await Promise.all(svgsWithBBs.map((svg, i) => fs.writeFile(`${outputDir}/${filePrefix}-${batch * batchSize + i}.svg`, svg)))
    await Promise.all(svgsWithBBs.map((svg, i) => renderer.saveAsPngWithProperSize(svg, 8, `${outputDir}/${filePrefix}-${batch * batchSize + i}.png`)))
    console.log('left:', smilesList.length)
    ++batch
  }

  await renderer.done()
})()
