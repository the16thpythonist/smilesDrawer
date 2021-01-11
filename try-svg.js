(async () => {
    const fs = require('fs')

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
    const {saveAsPngWithProperSize, propertiesFromXmlString, makeBoundingBox} = require("./src/generator/svg")

    const outputDir = "png-data"
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir)
    }

    const xmlFiles = []

    for (const [i, smiles] of smilesList.entries()) {
        const svg = jsdomDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const svgId = `svg-${i}`
        const size = 100

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

    const svgsWithBBs = []
    for (const {dom, xml} of infos) {
        const svg = new JSDOM(xml).window.document.documentElement.querySelector("svg")
        const bbContainer = jsdomDocument.createElementNS('http://www.w3.org/2000/svg', 'g')

        for (const {id, x, y, width, height} of dom.nodes) {
            const bb = makeBoundingBox(jsdomDocument, id, x, y, width, height)
            bbContainer.appendChild(bb)
        }

        for (const {id, x, y, width, height} of dom.edges) {
            const bb = makeBoundingBox(jsdomDocument,id, x, y, width, height)
            bbContainer.appendChild(bb)
        }

        svg.appendChild(bbContainer)

        svgsWithBBs.push(new XMLSerializer().serializeToString(svg))
    }

    await Promise.all(svgsWithBBs.map((svg, i) => saveAsPngWithProperSize(browser, svg, 1000, `${outputDir}/svg-bb-${i}.png`)))

    await browser.close()
})()