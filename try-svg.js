(async () => {
  const fs = require('fs-extra')
  const path = require('path')
  const Renderer = require('./src/generator/Renderer')
  const { readSmilesFromCsv } = require('./src/generator/misc')

  // const [smilesFile, column, filePrefix] = ['data/molecules.csv', 1, 'fullerenes']
  const [smilesFile, column, filePrefix] = ['data/zinc_250k.csv', 0, 'zinc']
  // const [smilesFile, column, filePrefix] = ['data/drugbank.csv', 0, 'drugbank']

  const outputDir = path.resolve(`png-data/${filePrefix}`)
  const smilesList = await readSmilesFromCsv(smilesFile, column, 100)

  const renderer = new Renderer(outputDir)
  await renderer.init()

  const xmlFiles = smilesList.map(smiles => renderer.createRawSvgFromSmiles(smiles))
  const infos = await Promise.all(xmlFiles.map(xml => renderer.propertiesFromXmlString(xml)))
  const svgsWithBBs = infos.map(b => renderer.addBoundingBoxesToSvg(b))

  const batchSize = 10
  let batch = 0

  while (svgsWithBBs.length) {
    const current = svgsWithBBs.splice(0, batchSize)

    // await Promise.all(current.map((svg, i) => fs.writeFile(`${outputDir}/${filePrefix}-${batch * n + i}.svg`, svg)))
    await Promise.all(current.map((svg, i) => renderer.saveAsPngWithProperSize(svg, 8, `${outputDir}/${filePrefix}-${batch * batchSize + i}.png`)))
    console.log('left:', svgsWithBBs.length)
    ++batch
  }

  await renderer.done()
})()
