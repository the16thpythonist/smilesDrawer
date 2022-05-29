(async() => {
  const { v4: uuid } = require('uuid')
  const path = require('path')
  const treekill = require('tree-kill')
  const fs = require('fs-extra')
  const util = require('util')
  const _ = require('lodash')
  const exec = util.promisify(require('child_process').exec)
  const { fork } = require('child_process')

  const oldCwd = process.cwd()
  const newCwd = path.resolve(path.dirname(__filename))

  if (oldCwd !== newCwd) {
    console.log(`changing working directory from ${oldCwd} to ${newCwd}`)
    process.chdir(newCwd)
  }

  const { readSmilesFromCsv, cliParams, hash, setIntersection, wait } = require('./src/generator/misc')

  // This is an object which contains fields that correspond to the command line parameters which were
  // passed when calling this module as a command.
  // The original command line parameters are typically dash-separated (for example --from-csv-file) and
  // the fields of this object are the corresponding camelCase names for those parameters (fromCsvFile)
  const conf = cliParams()

  if (conf.clean) {
    console.log(`deleting ${conf.outputDirectory}`)
    await fs.emptyDir(conf.outputDirectory)
  }

  await fs.ensureDir(conf.outputDirectory)

  console.log('reading smiles file')
  const smilesList = (await readSmilesFromCsv(conf.csvFile, conf.csvColumn, conf.amount))
    .filter(s => s.length >= conf.minSmilesLength && s.length <= conf.maxSmilesLength)
    .slice(0, conf.amount)

  console.log(`found ${smilesList.length} SMILES strings with length between ${conf.minSmilesLength} and ${conf.maxSmilesLength} characters`)

  const label = `generating ${smilesList.length} images with concurrency ${conf.concurrency}`
  console.time(label)

  const xCmd = `find ${conf.outputDirectory} -type f -name 'x.*'`
  const yCmd = `find ${conf.outputDirectory} -type f -name 'y.*'`
  console.log(xCmd)
  console.log(yCmd)

  let x = await exec(xCmd, { maxBuffer: 100 * 1024 * 1024 })
  let y = await exec(yCmd, { maxBuffer: 100 * 1024 * 1024 })
  x = x.stdout.split('\n').map(x => x.split('/').slice(-2)[0])
  y = y.stdout.split('\n').map(x => x.split('/').slice(-2)[0])

  const existing = setIntersection(new Set(x), new Set(y))

  const smilesToId = {}
  for (const smiles of smilesList) {
    const id = hash(smiles)
    smilesToId[smiles] = existing.has(id) ? null : id
  }

  const missing = smilesList.filter(x => !!smilesToId[x])
  console.log(`removed ${smilesList.length - missing.length} items, ${missing.length} left`)

  // aneb: clear state after every n images
  const numberOfBatches = Math.round(conf.amount / conf.batchSize)
  const batches = _.chunk(missing, Math.round(conf.amount / numberOfBatches))

  console.log(`processing ${conf.amount} images in ${batches.length} batches (batch size ${conf.batchSize}, concurrency ${conf.concurrency})`)

  const userDataDir = path.join('user-data', uuid())
  await fs.ensureDir(userDataDir)

  const browserOptions = {
    userDataDir: userDataDir,
    headless: true,
    devtools: false
  }

  const debug = typeof v8debug === 'object'
  const children = {}
  let done = 0
  for (const [index, smilesList] of batches.entries()) {
    const message = { conf, smilesList, browserOptions }

    const args = { }

    // aneb: inspector error are IDE-related and do not occur when calling node from command line
    if (debug) {
      const offset = (index % conf.concurrency) + 1
      const port = process.debugPort + offset

      console.log(`adding debug port ${port}`)
      args.execArgv = [`--inspect=${port}`]
    }

    const child = fork('src/worker.js', args)
    children[child.pid] = { }

    child.on('message', function({ browserPid }) {
      children[this.pid] = { browserPid }
    })

    child.on('exit', function(code) {
      done += 1
      const state = code ? 'FAIL' : 'SUCCESS'

      console.log(`${new Date().toUTCString()} - ${state} ${done}/${batches.length} done`)

      treekill(children[this.pid].browserPid, 'SIGKILL')
      treekill(this.pid, 'SIGKILL')
      delete children[this.pid]
    })

    child.send(message)

    while (Object.keys(children).length >= conf.concurrency) {
      await wait(1000)
    }
  }

  // aneb: must also wait for last processes to finish
  while (Object.keys(children).length !== 0) {
    await wait(100)
  }

  await fs.remove(userDataDir)
  console.timeEnd(label)
})()
