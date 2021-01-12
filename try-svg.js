(async () => {
    const fs = require('fs')
    const fsP = require('fs/promises')

    const puppeteer = require('puppeteer');

    const jsdom = require("jsdom");
    const {JSDOM} = jsdom;
    const window = (new JSDOM(``)).window
    const XMLSerializer = window.XMLSerializer
    const jsdomDocument = window.document

    const browser = await puppeteer.launch({headless: true, devtools: false});

    const Parser = require("./src/drawer/Parser")
    const SvgDrawer = require("./src/drawer/SvgDrawer")

    const {smilesList} = require("./src/generator/misc")
    const {saveAsPngWithProperSize, propertiesFromXmlString, makeBoundingBox, mergeBoundingBoxes} = require("./src/generator/svg")

    const outputDir = "png-data"
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir)
    }

    const xmlFiles = []

    for (const [i, smiles] of smilesList.entries()) {
        const svg = jsdomDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const svgId = `svg-${i}`
        const size = 500

        svg.setAttributeNS(null, "id", svgId)
        svg.setAttributeNS(null, "smiles", smiles)
        svg.setAttributeNS(null, "width", size)
        svg.setAttributeNS(null, "height", size)

        const svgDrawer = new SvgDrawer({height: size, width: size});
        const tree = Parser.parse(smiles)
        svgDrawer.draw(tree, svg, 'light', false);

        const xml = new XMLSerializer().serializeToString(svg);
        xmlFiles.push(xml)
    }

    const infos = await Promise.all(xmlFiles.map(xml => propertiesFromXmlString(browser, xml)))
    const correctBoundingBox = (x, y, width, height) => {
        const minValue = 0.5
        const newValue = 2
        let [xCorr, yCorr, widthCorr, heightCorr] = [x, y, width, height]

        if (heightCorr < minValue) {
            heightCorr = newValue
            yCorr -= newValue / 2
        }

        if (widthCorr < minValue) {
            widthCorr = newValue
            xCorr -= newValue / 2
        }

        return {x: xCorr, y: yCorr, width: widthCorr, height: heightCorr}
    }
    const svgsWithBBs = []
    for (const {dom, xml} of infos) {
        const svg = new JSDOM(xml).window.document.documentElement.querySelector("svg")
        const bbContainer = jsdomDocument.createElementNS('http://www.w3.org/2000/svg', 'g')

        for (const {id, x, y, width, height} of dom.nodes) {
            const bb = makeBoundingBox(jsdomDocument, id, x, y, width, height)
            bbContainer.appendChild(bb)
        }

        const correctedEdges = dom.edges.map(({id, x, y, width, height}) => Object.assign({id: id}, correctBoundingBox(x, y, width, height)))
        const merged = mergeBoundingBoxes(correctedEdges)
        for (let {id, x, y, width, height} of merged) {
            const bb = makeBoundingBox(jsdomDocument, id, x, y, width, height)
            bbContainer.appendChild(bb)
        }

        svg.appendChild(bbContainer)

        svgsWithBBs.push(new XMLSerializer().serializeToString(svg))
    }
    // await Promise.all(svgsWithBBs.map((svg, i) => fsP.writeFile(`${outputDir}/svg-bb-${i}.svg`, svg)))

    await Promise.all(svgsWithBBs.map((svg, i) => saveAsPngWithProperSize(browser, svg, 1000, `${outputDir}/svg-bb-${i}.png`)))

    await browser.close()
})()