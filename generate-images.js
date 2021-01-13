(async () => {
  // TODO curate list of interesting test SMILES
  // TODO add methods to renderer for generation of multiple types of labels, maybe params like atoms="box", bonds="ends"

  const Renderer = require('./src/generator/Renderer')
  const { readSmilesFromCsv, cliParams } = require('./src/generator/misc')

  const conf = cliParams()

  console.log('reading smiles file')
  const smilesList = await readSmilesFromCsv(conf.csvFile, conf.csvColumn, conf.amount)

  const renderer = new Renderer(conf)
  await renderer.init()

  const batchSize = 20
  let batch = 0
  console.log('generating files')
  while (smilesList.length) {
    console.log(`left: ${smilesList.length}/${conf.amount}`)
    const smilesBatch = smilesList.splice(0, batchSize)
    const xmlFiles = smilesBatch.map(smiles => renderer.createRawSvgFromSmiles(smiles))

    const infos = await Promise.all(xmlFiles.map(xml => renderer.propertiesFromXmlString(xml)))
    const infosWithBoundingBoxes = infos.map(i => renderer.addBoundingBoxesToSvg(i))

    await Promise.all(
      infos.map((info, i) => renderer.saveAsPngWithProperSize(info.xml, `${renderer.directory}/${conf.filePrefix}-${batch * batchSize + i}-no-bb`))
    )

    await Promise.all(
      infosWithBoundingBoxes.map((info, i) => renderer.saveAsPngWithProperSize(info, `${renderer.directory}/${conf.filePrefix}-${batch * batchSize + i}-bb`, 100))
    )

    ++batch
  }
  console.log(`left: ${smilesList.length}/${conf.amount}`)

  await renderer.done()
})()
