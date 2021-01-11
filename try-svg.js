(async () => {
    const fs = require('fs')

    const puppeteer = require('puppeteer');

    const jsdom = require("jsdom");
    const {JSDOM} = jsdom;
    const window = (new JSDOM(``)).window
    const XMLSerializer = window.XMLSerializer
    const jsdomDocument = window.document

    const browser = await puppeteer.launch({headless: false, devtools: true});

    const Parser = require("./src/drawer/Parser")
    const SvgDrawer = require("./src/drawer/SvgDrawer")

    const smilesList = [
        "Clc(c(Cl)c(Cl)c1C(=O)O)c(Cl)c1Cl",
        // "CCC1=C(N)C(C)=NO1",
        // "C1C2C3C2N2C1C32",
        // "C1C2CC1C1NC1CO2",
        // "C1CC1C1=NON=N1",
        // "CC#CC1=CCC2CC12",
        // "CC#CC1=NN(C)C=N1",
        // "CC(=O)C(=O)N1CCC1",
        // "CC(=O)C(C)(O)CC=O",
        // "CC(=O)C1(C)OCC1O",
        // "CC(=O)C1=CCCC1O",
        // "CC(C)C(C)(CO)CO",
        // "CC(C)C(C)C(=O)CO",
        // "CC(C)C1(CC#C)CO1",
        // "CC(C)N1N=NNC1=O",
        // "CC(C)OC(C)C=O",
        // "CC(C)OCC(O)C#N",
        // "CC(O)C(O)CC1CN1",
        // "CC(O)C1(CO1)C1CC1",
        // "CC(O)C1CC2(C)NC12",
        // "CC(O)CC1OCC1=O",
        // "CC(OCC#N)C=O",
        // "CC1(C)N2CC1(C2)C=O",
        // "CC1(C)OC(=N)C1O",
        // "CC1(CCC1)C(=O)C#C",
        // "CC1(CNC(N)=O)CO1",
        // "CC1(O)C2CC1C=CC2",
        // "CC12C3C1C1(O)CC2C31",
        // "CC12CC(C)(COC1)O2",
        // "CC12CC1(O)C(=N)OC2",
        // "CC12CC3(C)C1C=CC23",
        // "CC12CC=CC(CO1)O2",
        // "CC12CN(C1)C2C1CO1",
        // "CC12CN1CC(=O)C=C2",
        // "CC12COC3C(OC1)C23",
        // "CC12NC(C3CC13)C2=O",
        // "CC1=C(C)CC(C)(C)C1",
        // "CC1=C(N=C(O)N1)C#N",
        // "CC1=C(NN=C1)OC=N",
        // "CC1=CC(N)=CC(C)=C1",
        // "CC1=CN=C(CO)C=C1",
        // "CC1=NC(C)(CO1)C#N",
        // "CC1=NOC(O)=CC1=N",
        // "CC1C(=O)C=CC11CN1",
        // "CC1C2NC(=O)C12C=O",
        // "CC1C=C2CCC2C1C",
        // "CC1CC(C(N)=O)C1=O",
        // "CC1CC2(C)CC1C2=O",
        // "CC1CC2(CO2)C2OC12",
        // "CC1NC(=O)C(C)=C1N",
        // "CC1NC(=O)C11CC1",
        // "CC1NC11COC1C#C"
    ]

    const outputDir = "png-data"
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir)
    }

    const propertiesFromXmlString = async xml => {
        const page = await browser.newPage();
        await page.setContent(xml, {waitUntil: 'domcontentloaded'})
        // await page.setViewport({
        //     width: 1920,
        //     height: 1080
        // })

        const dom = await page.evaluate(() => {
            const nodes = []
            const edges = []

            const vertices = document.documentElement.querySelectorAll("[vertex-id]")
            for (const vertex of vertices) {
                const {x, y, width, height} = vertex.getBBox()
                const elements = Array.from(vertex.querySelectorAll("tspan")).map(c => c.textContent).filter(c => !!c)
                const id = vertex.getAttribute("vertex-id")
                nodes.push({id, elements, x, y, width, height})
            }

            const bonds = document.documentElement.querySelectorAll("[edge-id]")
            for (const bond of bonds) {
                const {x, y, width, height} = bond.getBBox()
                const id = bond.getAttribute("edge-id")
                edges.push({id, x, y, width, height})
            }

            return {nodes, edges}
        })

        // TODO use later to generate files
        const element = await page.$('svg');
        await element.screenshot({path: 'logo-screenshot.png', omitBackground: true});

        return {dom, xml}
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
        // svg.setAttributeNS(null, "viewbox", `0 0 ${size} ${size}`)
        // TODO add fill color, e.g. jpeg has black background only
        // TODO add image resizing later

        const svgDrawer = new SvgDrawer({height: size, width: size});
        const tree = Parser.parse(smiles)
        svgDrawer.draw(tree, svg, 'light', false);

        const xml = new XMLSerializer().serializeToString(svg);
        xmlFiles.push(xml)
        fs.writeFileSync(`${outputDir}/${svgId}.svg`, xml)
    }
    const boundingBoxes = await Promise.all(xmlFiles.map(propertiesFromXmlString))
    debugger
    await browser.close()
    // const boundingBoxes = await propertiesFromXmlString(xml)
})()