class LangwingCache {
	constructor(maxItems = 100) {
		this.maxItems = maxItems;
		this.prefix = 'langwing-';
		this.suffix = '-variable';
		this._init();
	}

	// Hashes a string into SHA-256 hex
	async _hashKey(input) {
		const encoder = new TextEncoder();
		const data = encoder.encode(input);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
	}

	// Initializes the cache: trims, sorts, and reindexes
	_init() {
		const entries = Object.entries(localStorage)
			.filter(([key]) => key.startsWith(this.prefix) && key.endsWith(this.suffix))
			.map(([key, value]) => {
				try {
					const parsed = JSON.parse(value);
					return {
						key,
						value: parsed,
						time: parsed._timestamp || 0
					};
				} catch {
					return null;
				}
			})
			.filter(Boolean);

		// Sort most recent first
		entries.sort((a, b) => b.time - a.time);

		// Keep N most recent
		const toKeep = entries.slice(0, this.maxItems);
		const toRemove = entries.slice(this.maxItems);

		// Remove extras
		toRemove.forEach(entry => localStorage.removeItem(entry.key));

		// // Re-index kept items
		// toKeep.forEach((entry, index) => {
		// 	const newKey = `${this.prefix}${index}${this.suffix}`;
		// 	entry.value._timestamp = Date.now();
		// 	localStorage.setItem(newKey, JSON.stringify(entry.value));
		// 	if (entry.key !== newKey) {
		// 		localStorage.removeItem(entry.key);
		// 	}
		// });
	}

	// Sets a new entry using a hashed key
	async set(key, value) {
		const hashed = await this._hashKey(key);
		// console.log("langwing key hashed", hashed)
		const fullKey = `${this.prefix}${hashed}${this.suffix}`;
		const data = {...value, _timestamp: Date.now()};
		localStorage.setItem(fullKey, JSON.stringify(data));
		// this._init();
	}

	// Gets a value by hashed key
	async get(key) {
		const hashed = await this._hashKey(key);
		const fullKey = `${this.prefix}${hashed}${this.suffix}`;
		const raw = localStorage.getItem(fullKey);
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw);
			delete parsed._timestamp;
			return parsed;
		} catch {
			return null;
		}
	}


	// Removes all keys matching the pattern
	clear() {
		Object.keys(localStorage).forEach(key => {
			if (key.startsWith(this.prefix) && key.endsWith(this.suffix)) {
				localStorage.removeItem(key);
			}
		});
	}
}

function printLocalStorage() {
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i); // Get the key at the current index
		const value = localStorage.getItem(key); // Get the value associated with the key
		if (key.includes("langwing"))
			console.log(`langwing Key: ${key}, Value: ${value}`);
	}
}

class OCRSpaceAPI {
	constructor(apiKey) {
		this.apiKey = apiKey;
		this.endpoint = 'https://api.ocr.space/Parse/Image';
	}

	// Method A: OCR via URL
	async ocrViaUrl(imageUrl, language = 'eng', isOverlayRequired = true) {

		throw Error("Not Implemented")

		const formData = new URLSearchParams();
		formData.append('url', imageUrl);
		formData.append('language', language);
		formData.append('isOverlayRequired', isOverlayRequired.toString());

		try {
			const response = await fetch(this.endpoint, {
				method: 'POST', headers: {
					'apikey': this.apiKey, 'Content-Type': 'application/x-www-form-urlencoded'
				}, body: formData
			});

			return await response.json();
		} catch (error) {
			console.error('Error in ocrViaUrl:', error);
			throw error;
		}
	}

	// Method B: OCR via file upload
	async ocrViaFile(file, language = 'eng', isOverlayRequired = true) {

		const formData = new FormData();
		formData.append('file', file);
		formData.append('language', language);
		formData.append('isOverlayRequired', isOverlayRequired.toString());

		try {
			const response = await fetch(this.endpoint, {
				method: 'POST', headers: {
					'apikey': this.apiKey
				}, body: formData
			});

			return await response.json();
		} catch (error) {
			console.error('Error in ocrViaFile:', error);
			throw error;
		}
	}

	// Method C: OCR via Base64 string
	async ocrViaBase64(base64Image, language = 'eng', isOverlayRequired = true) {
		const formData = new FormData();
		formData.append('base64Image', base64Image);
		formData.append('language', language);
		// formData.append('filetype', 'jpg');
		formData.append('isOverlayRequired', isOverlayRequired.toString());
		formData.append('OCREngine', '2');

		console.log("langwing Fetching OCR")

		const response = await fetch(this.endpoint, {
			method: 'POST',
			headers: {
				'apikey': this.apiKey
			},
			body: formData,
			// cache: "force-cache"
		});

		console.log("langwing Got OCR Response!")

		if (response.status !== 200) {
			throw Error('OCR Failed')
		}

		const data = await response.json();

		// await fetch('http://localhost:8000/api/save-json', {
		// 	method: 'POST',
		// 	headers: {
		// 		'Accept': 'application/json'
		// 	},
		// 	body: JSON.stringify(data)
		// });

		if (data['IsErroredOnProcessing']) {
			console.log("langwing", data)
			throw Error('OCR Failed')
		}

		const lines = data['ParsedResults'][0]['TextOverlay']['Lines']

		const result = []

		for (const line of lines) {
			let minX = line['Words'][0]['Left'];
			let maxX = line['Words'][0]['Left'] + line['Words'][0]['Width'];

			for (const word of line['Words']) {
				let x1 = word['Left'];
				let x2 = word['Left'] + word['Width'];
				if (x1 < minX) {
					minX = x1;
				}
				if (maxX < x2) {
					maxX = x2;
				}
			}
			result.push({
				text: line['LineText'],
				x1: minX,
				y1: line['MinTop'],
				height: line['MaxHeight'],
				width: maxX - minX,
				boxes: line['Words'].map((w) => ({
					x1: w["Left"],
					y1: w["Top"],
					width: w["Width"],
					height: w["Height"],
					text: w["WordText"]
				}))

			})
		}

		return result;


	}

	async ocrViaBase64Mock(base64Image, language = 'eng', isOverlayRequired = true) {
		const response = await fetch('http://localhost:8000/', {
			method: 'GET',
			headers: {
				'Accept': 'application/json'
			}
		});

		const data = await response.json()

		console.log("MOCK RESPONSE:", data)

		if (data['IsErroredOnProcessing']) {
			throw Error('OCR Failed')
		}

		const lines = data['ParsedResults'][0]['TextOverlay']['Lines']

		const result = []

		for (const line of lines) {
			let minX = line['Words'][0]['Left'];
			let maxX = line['Words'][0]['Left'] + line['Words'][0]['Width'];

			for (const word of line['Words']) {
				let x1 = word['Left'];
				let x2 = word['Left'] + word['Width'];
				if (x1 < minX) {
					minX = x1;
				}
				if (maxX < x2) {
					maxX = x2;
				}
			}
			result.push({
				'text': line['LineText'],
				'x1': minX,
				'y1': line['MinTop'],
				'h': line['MaxHeight'],
				'w': maxX - minX
			})
		}

		return result;

		// OCR by word
		// for (const line of lines) {
		// 	const words = []
		// 	for (const word of line['Words']) {
		// 		words.push({
		// 			'text': word['WordText'],
		// 			'x1': word['Left'],
		// 			'y1': word['Top'],
		// 			'w': word['Width'],
		// 			'h': word['Height'],
		// 			'x2': word['Left'] + word['Width'],
		// 			'y2': word['Top'] + word['Height']
		// 		})
		// 	}
		// 	result.push(words);
		// }


	}
}

class GeminiAPI {
	constructor(apiKey, system_instruction) {
		// https://ai.google.dev/gemini-api/docs/text-generation?lang=python
		this.apiKey = apiKey;
		this.endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
		this.system_instruction = system_instruction
	}

	async text2Text(text) {
		const url = `${this.endpoint}?key=${this.apiKey}`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				"system_instruction": {"parts": {"text": this.system_instruction}},
				"contents": [{"parts": [{"text": text}]}]
			})
		})

		if (!response.ok) {
			console.log(response)
			throw Error("Gemini not ok!")
		}

		const content = await response.json()

		return content["candidates"][0]["content"]["parts"][0]["text"]

	}

}


const ocrSpaceAPI = new OCRSpaceAPI(OCR_SPACE_API_KEY);

class BatchProcessor {
	constructor(callback, timeout = 1000) {
		this.queue = []
		this.callback = callback
		this.timeout = timeout

		this.start()
	}

	start() {
		setInterval(async () => {

			if (this.queue.length === 0) return

			const a = this.queue.shift()
			const b = this.queue.shift()

			const [resA, resB] = await this.callback(a.x, b.x)
			a.resolve(resA)
			if (b) b.resolve(resB)

		}, this.timeout)
	}

	get(x) {
		return new Promise((resolve, reject) => {
			this.queue.push({x, resolve, reject})
		})
	}

}

async function stitchAndSend(img1Canvas, img2Canvas) {
	// Take the first two images from the queue
	const img1Width = img1Canvas.width;
	const img1Height = img1Canvas.height;
	const img2Width = img2Canvas.width;
	const img2Height = img2Canvas.height;

	// Stitch images horizontally
	const stitchedWidth = img1Width + img2Width;
	const stitchedHeight = Math.max(img1Height, img2Height);

	const stitchedCanvas = document.createElement('canvas');
	stitchedCanvas.width = stitchedWidth;
	stitchedCanvas.height = stitchedHeight;
	const ctx = stitchedCanvas.getContext('2d');

	ctx.drawImage(img1Canvas, 0, 0);
	ctx.drawImage(img2Canvas, img1Width, 0);

	// Convert stitched image to Base64
	// Using jpeg with 0.95 quality for potentially smaller size while maintaining quality.
	const stitchedBase64 = stitchedCanvas.toDataURL('image/jpeg', 0.95);

	// Send stitched image to OCR API
	// The OCRSpaceAPI.ocrViaBase64 method in the provided code
	// already processes the raw OCR result into a simplified line structure.
	const stitchedOCRResult = await ocrSpaceAPI.ocrViaBase64(stitchedBase64, 'eng', true);
	// console.log("Stitched OCR Result (Processed):", stitchedOCRResult);

	// Map bounding box coordinates back to original images
	const image1Results = [];
	const image2Results = [];

	if (stitchedOCRResult && Array.isArray(stitchedOCRResult)) {
		for (const line of stitchedOCRResult) {
			// Create copies to avoid modifying the original line objects from the OCR result
			// Deep copy the structure including the boxes array
			const mappedLine = {
				...line,
				boxes: line.boxes.map(word => ({...word}))
			};

			// Determine which image the line belongs to based on its starting x-coordinate
			// A line crossing the boundary will be assigned entirely to one image based on its start point (x1).
			// This is a simplification; a more complex approach might split lines or assign based on center/majority.
			if (mappedLine.x1 < img1Width) {
				// Belongs to the first image. Coordinates are already relative to its top-left.
				image1Results.push(mappedLine);
			} else {
				// Belongs to the second image. Adjust x-coordinates.
				mappedLine.x1 = line.x1 - img1Width;

				// Map word bounding boxes within the line
				mappedLine.boxes.forEach(word => {
					word.x1 = word.x1 - img1Width;
				});
				image2Results.push(mappedLine);
			}
		}
	}

	// console.log("Mapped Image 1 Results:", image1Results);
	// console.log("Mapped Image 2 Results:", image2Results);

	// Return the results for the two images
	return [image1Results, image2Results]
}

const BATCH_OCR = false

let batchOCR
if (BATCH_OCR) {
	batchOCR = new BatchProcessor(stitchAndSend, timeout = 100)
	console.log("langwing image batch processing enabled!")
	getOcr = async (base64) => await batchOCR.get(base64)
} else {
	console.log("langwing image batch processing disable!")
	getOcr = async (base64) => await ocrSpaceAPI.ocrViaBase64(base64, 'eng', true)
}


const GEMINI_TRANSLATE_PROMPT = `Translate the following English text into Vietnamese using Southern Vietnamese dialect.

Your response must follow this exact format:
0) [Translation 1]
1) [Translation 2]
2) [Translation 3]
...and so on

About the source material:
- Each numbered section (0, 1, 2, etc.) represents text from one speech bubble or text element (such as a poster)
- The text comes from manga panels arranged in standard reading order (left to right, top to bottom)
- All text is from the same manga chapter
- Different characters may speak throughout the chapter

Important guidelines:
- RETURN THE EXACT SAME NUMBER OF ITEM AS IN THE INPUT. DO NOT GROUP ITEMS!
- Translate all groups in English
- Maintain the same group numbering ("x)") as in my original text
- Correct OCR errors (such as "o" mistaken for "0")
- Do not combine separate groups
- Use the entire corpus as context for each section, as all text belongs to the same manga chapter
- Text within the same group should be in the same language, though occasional borrowed words are acceptable.
- Text in separate groups can be in different languages
- For any text already in Vietnamese, only correct OCR errors
- Mark severely error-filled or contextually unclear text as "INCOMPREHENSIBLE" (return ONLY "INCOMPREHENSIBLE")
- Mark any text you are unclear about, having strange language, strange character as "INCOMPREHENSIBLE" (return ONLY "INCOMPREHENSIBLE")
- Return only the translated text without additional commentary
`

const geminiAPI = new GeminiAPI(GEMINI_API_KEY, GEMINI_TRANSLATE_PROMPT);


function getBase64Image(img) {
	let canvas = document.createElement("canvas")
	canvas.width = img.naturalWidth
	canvas.height = img.naturalHeight
	let ctx = canvas.getContext("2d")
	ctx.drawImage(img, 0, 0)
	return canvas
}

function getFontScale(context, text, words, fontFamily, w, h, lineSpacing, lineCount,
                      baseSpaceWidth, baseWWDict, baseFontHeight, baseTextWidth) {

	let fontScale = 0
	for (let i = -1; i <= 1; i++) {
		const scaleX = w / baseTextWidth * lineCount
		const scaleY = h / (baseFontHeight * lineSpacing * (lineCount - 1) + baseFontHeight)

		fontScale = Math.max(fontScale, Math.ceil(Math.min(scaleX, scaleY)))
	}

	for (let count = 0; count < 3; count++) {
		const spaceWidth = baseSpaceWidth * fontScale

		let currLineWidth = baseWWDict[words[0]] * fontScale

		let fontLineCount = 1

		for (let i = 1; i < words.length; i++) {
			const wordWidth = baseWWDict[words[i]] * fontScale
			currLineWidth += spaceWidth + wordWidth
			if (currLineWidth > w) {
				currLineWidth = wordWidth
				fontLineCount++
			}
		}

		if (fontLineCount === lineCount) {
			// console.log("fondScale found!")
			break
		}

		if (fontLineCount > lineCount) {
			// console.log(`${fontScale} -> ${fontScale - 1}`)
			fontScale--
		}
	}

	return fontScale
}

function calcTextAreaRenderProps(context, text, w, h, fontFamily, lineCount,
                                 lineSpacing = 1.2, textAlign = "justify") {


	const words = text.split(' ')


	// Calc base text sizes

	const baseFontScale = 100

	context.font = `${baseFontScale}px ${fontFamily}`;

	const baseSpaceWidth = context.measureText(' ').width / baseFontScale
	const baseWWDict = {}
	for (let i = 0; i < words.length; i++) {
		if (baseWWDict[words[i]] === undefined)
			baseWWDict[words[i]] = context.measureText(words[i]).width / baseFontScale
	}
	const metrics = context.measureText(text);
	const baseFontHeight = (metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent) / baseFontScale

	const fontScale = getFontScale(context, text, words, fontFamily,
		w, h, lineSpacing, lineCount, baseSpaceWidth, baseWWDict, baseFontHeight,
		metrics.width / baseFontScale)

	// TODO: There is no guarantee that it will span lineCount lines

	// Compute textLines

	context.font = `${fontScale}px ${fontFamily}`;

	const textLines = [[words[0]]]

	const spaceWidth = baseSpaceWidth * fontScale

	let currLineWidth = baseWWDict[words[0]] * fontScale

	for (let i = 1; i < words.length; i++) {
		const wordWidth = baseWWDict[words[i]] * fontScale
		currLineWidth += spaceWidth + wordWidth

		if (currLineWidth > w) {
			currLineWidth = wordWidth
			textLines.push([words[i]])
		} else {
			textLines.at(-1).push(words[i])
		}
	}

	// console.log(textLines)

	// Compute blockHeight, blockWidth

	let blockWidth = 0
	for (let i = 0; i < textLines.length; i++) {
		blockWidth = Math.max(blockWidth,
			context.measureText(textLines[i].join(" ")).width)
	}

	let m = context.measureText("a")
	const lineHeight = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent
	// console.log("lineHeight", fontScale, lineHeight)
	const lineSpacingHeight = lineHeight * lineSpacing
	const blockHeight = lineSpacingHeight * (textLines.length - 1) + lineHeight

	const marginX = (w - blockWidth) / 2
	const marginY = (h - blockHeight) / 2

	// Compute wordBoxes

	let y = marginY + lineHeight

	const wordBoxes = []
	for (let i = 0; i < textLines.length; i++) {
		const textLine = textLines[i]

		let x = marginX
		let spaceWidth
		if (textAlign === "justify")
			spaceWidth = (blockWidth - context.measureText(textLine.join("")).width) / (textLine.length - 1)
		else if (textAlign === "left")
			spaceWidth = context.measureText(" ").width

		for (let j = 0; j < textLine.length; j++) {
			wordBoxes.push({text: textLine[j], x: x, y: y - m.fontBoundingBoxDescent})
			x += baseWWDict[textLine[j]] * fontScale + spaceWidth
		}
		y += lineSpacingHeight
	}

	return {
		fontScale,
		blockWidth,
		blockHeight,
		wordBoxes,
		marginX,
		marginY
	}
}

function updateTextAreasRenderProps(context, groups) {

	for (let i = 0; i < groups.length; i++) {

		const group = groups[i]
		const {text, width, height, boxes, fontFamily} = group

		const {
			fontScale: fontSize,
			wordBoxes,
			marginX,
			marginY
		} = calcTextAreaRenderProps(context, text,
			width - lineWidth, height - lineWidth,
			"Inter", boxes.length, 1.2, "left")

		group.marginX = marginX
		group.marginY = marginY
		group.fontSize = fontSize
		group.visible = true
		group.wordBoxes = wordBoxes

		groups[i] = group

	}
}

async function geminiTranslateTexts(texts) {
	let textString = ""
	for (let i = 0; i < texts.length; i++) {
		textString += `${i}) ${texts[i]}\n`
	}

	const textStringTranslated = await geminiAPI.text2Text(textString)

	console.log("langwing gemini textString:", textString)
	console.log("langwing gemini textStringTranslated:", textStringTranslated)

	// console.log(textString)
	// console.log(textStringTranslated)

	const parseResult = [...textStringTranslated.matchAll(/^\d+\) (.+)\n/gm)].map(match => match[1])
	console.log("langwing parse result", parseResult)
	return parseResult
}

function checkSeg(line, groups) {
	if (groups.length === 0) return [false, null]

	groups.sort((a, b) => a.xMin - b.xMin)

	const boxes = line.boxes


	let k = 0
	while (k < groups.length && groups[k].xMax <= boxes[0].x1) k++

	if (k >= groups.length) return [false, null]

	console.log("langwing line groups k", line, groups, k)

	if (boxes.at(-1).x1 + boxes.at(-1).width < groups[k].xMin) return [false, null]

	let i = 0
	let j = -1

	while (j < boxes.length - 1 && k < groups.length) {
		j++

		const segMin = boxes[i].x1
		const segMax = boxes[j].x1 + boxes[j].width
		const segCenter = (segMin + segMax) / 2

		const g = groups[k]
		const groupCenter = (g.xMin + g.xMax) / 2

		if (Math.abs(segCenter - groupCenter) < 10) {
			const seg = {...line}
			seg.x1 = boxes[i].x1
			seg.width = boxes[j].x1 + boxes[j].width - boxes[i].x1
			seg.boxes = boxes.slice(i, j + 1)
			seg.text = seg.boxes.map((box) => box.text).join(" ")
			groupPushLine(g, seg, "center")

			i = j + 1
			k++
			continue
		}

		if (segCenter > groupCenter)
			return [false, null]

		if (j === boxes.length - 1 && segCenter < groupCenter)
			return [false, null]
	}

	return [true, groups]
}

function groupPushLine(g, line, align) {
	g.boxes.push(line)
	g.align = align
	g.yMin = Math.min(g.yMin, line.y1)
	g.yMax = Math.max(g.yMax, line.y1 + line.height)
	g.xMin = Math.min(g.xMin, line.x1)
	g.xMax = Math.max(g.xMax, line.x1 + line.width)
	g.text = line.text
}

function groupLines(lines) {

	const MOE = 5

	if (lines.length === 0)
		return []

	lines.sort((a, b) => a.y1 - b.y1)

	const groups = []

	let openGroups = [{
		boxes: [lines[0]],
		xMin: lines[0].x1,
		yMin: lines[0].y1,
		xMax: lines[0].x1 + lines[0].width,
		yMax: lines[0].y1 + lines[0].height,
		align: null
	}]

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]

		// console.log(line.text, line)

		const n = openGroups.length
		for (let j = 0; j < n; j++) {
			if (line.y1 - openGroups[0].yMax < 10)
				openGroups.push(openGroups[0])
			else
				groups.push(openGroups[0])
			openGroups.shift()
		}

		let found = false
		for (let g of openGroups) {

			let align = g.align
			const leftDiff = Math.abs(line.x1 - g.xMin)
			const rightDiff = Math.abs(line.x1 + line.width - g.xMax)
			const midDiff = Math.abs(line.x1 + line.width / 2 - (g.xMin + g.xMax) / 2)

			if (align == null) {
				if (leftDiff < MOE && rightDiff > MOE)
					align = "left"
				else if (midDiff < MOE && Math.abs(leftDiff - rightDiff) < MOE)
					align = "center"
				else if (leftDiff > MOE && rightDiff < MOE)
					align = "right"
			}

			if ((align === "left" || align == null) && leftDiff < MOE) {
				groupPushLine(g, line, align)
				found = true
				// console.log(`left ${line.text}`, line, `found ${g.boxes[0].text}`, g, leftDiff, midDiff)
				break
			}
			if ((align === "center" || align == null) && midDiff < MOE) {
				groupPushLine(g, line, align)
				found = true
				// console.log(`center ${line.text}`, line, `found ${g.boxes[0].text}`, g, leftDiff, midDiff)
				break
			}
		}

		if (found) continue


		let g
		[found, g] = checkSeg(line, openGroups.slice())
		if (found) {
			openGroups = g
			continue
		}

		openGroups.push({
			boxes: [line],
			xMin: line.x1,
			yMin: line.y1,
			xMax: line.x1 + line.width,
			yMax: line.y1 + line.height,
			text: line.text,
			align: null
		})

	}

	const ret = Array.prototype.concat(groups, openGroups)


	for (let i = 0; i < ret.length; i++) {
		const g = ret[i]

		ret[i] = {
			text: g.boxes.map((b) => b.text).join(" ").toLowerCase(),
			x: g.xMin,
			y: g.yMin,
			width: g.xMax - g.xMin,
			height: g.yMax - g.yMin,
			boxes: g.boxes
		}
	}

	return ret
}

const lineWidth = 1


const imageCache = new LangwingCache(100)
// imageCache.clear()

// console.log("langwing imageCache")
// printLocalStorage()

function renderTextArea(context, group, hasBorder = true) {
	context.translate(0.5, 0.5)

	const {
		x, y, width, height,
		fontSize, fontFamily,
		wordBoxes
	} = group

	context.fillStyle = "white"
	context.fillRect(x, y, width, height)
	console.log("debug fillRect", x, y, width, height)

	if (hasBorder) {
		context.lineWidth = lineWidth;
		context.strokeStyle = "blue"
		context.beginPath();
		context.rect(x, y, width, height);
		context.stroke();
	}

	context.font = `${fontSize}px ${fontFamily}`
	context.fillStyle = "black"


	for (let wordBox of wordBoxes)
		context.fillText(wordBox.text, x + lineWidth / 2 + wordBox.x, y - lineWidth / 2 + wordBox.y)

	context.translate(-0.5, -0.5)
}

function renderTextAreas(context, groups) {
	for (let i = 0; i < groups.length; i++) {
		if (groups[i].text.includes("INCOMPREHENSIBLE"))
			continue
		renderTextArea(context, groups[i], !groups[i].isTranslated)
	}
}

function eraseTextArea(context, group, img) {
	const {x, y, width, height} = group
	context.drawImage(img, x, y, width + lineWidth, height + lineWidth, x, y, width + lineWidth, height + lineWidth)
}

function hideTextArea(context, group, img,) {
	const {x, y, width, height} = group
	context.drawImage(
		img,
		x + lineWidth / 2, y + lineWidth / 2, width - lineWidth, height - lineWidth,
		x + lineWidth / 2, y + lineWidth / 2, width - lineWidth, height - lineWidth
	)
}


let imageCount = 0
const COUNT_MAX = 100
const MIN_IMAGE_HEIGHT = 400

function updateImageElement(img, canvas) {
	img.removeAttribute('srcset');
	img.removeAttribute('sizes');
	img.src = canvas.toDataURL('image/jpeg', 0.95)
}


async function translateImageCallback(mutationList, observer) {

	if (imageCount > COUNT_MAX) {
		return
	}

	const imgElements = document.getElementsByTagName("img");

	for (let index = 0; index < imgElements.length; index++) {

		const imgElement = imgElements[index]

		try {

			if (imgElement.height < MIN_IMAGE_HEIGHT) {
				continue;
			}

			// if (count < 3) {
			// 	continue
			// }

			if (imgElement.classList.contains('lw-stain')) {
				continue;
			}

			imgElement.classList.add("lw-stain")

			console.log("langwing image processing", `${imgElement.width}x${imgElement.height}`, imgElement)

			const originalImage = imgElement.cloneNode()

			const canvas = getBase64Image(imgElement);

			const context = canvas.getContext("2d")

			function getImageOnClickFn(textAreas) {
				return (e) => {

					const rect = e.target.getBoundingClientRect();
					const clickX = (e.clientX - rect.left) / imgElement.clientWidth * imgElement.naturalWidth;
					const clickY = (e.clientY - rect.top) / imgElement.clientHeight * imgElement.naturalHeight;

					console.log("Clicked:", clickX, clickY)

					for (let i = 0; i < textAreas.length; i++) {

						const area = textAreas[i]

						const {x, y, width, height} = area

						if (x < clickX && y < clickY && clickX < x + width && clickY < y + height) {


							if (area.visible)
								hideTextArea(context, area, originalImage)
							else
								renderTextArea(context, area, !area.isTranslated)

							area.visible = !area.visible;
							updateImageElement(imgElement, canvas)
							break;
						}
					}
				}
			}

			// Resize canvas (for output)
			// const outputWidth = 480;
			// const aspectRatio = imgElement.naturalHeight / imgElement.naturalWidth;
			// const outputHeight = outputWidth * aspectRatio;

			// let tempCanvas = document.createElement("canvas");
			// tempCanvas.width = outputWidth;
			// tempCanvas.height = outputHeight;
			// let tempCtx = tempCanvas.getContext("2d");
			// tempCtx.drawImage(canvas, 0, 0, outputWidth, outputHeight);
			const base64 = canvas.toDataURL("image/jpeg", 0.95)

			// printLocalStorage()]
			let lines
			const data = await imageCache.get(base64)
			if (data != null) {
				console.log("langwing found image cache")

				const context = canvas.getContext("2d")

				const textAreas = data["textAreas"]

				updateTextAreasRenderProps(context, textAreas)
				renderTextAreas(context, textAreas)

				// console.log('debug width', canvas.width, canvas.height)

				updateImageElement(imgElement, canvas)
				// console.log("langwing image updated", imgElement.src)
				imgElement.onclick = getImageOnClickFn(textAreas)


				break
			}

			imageCount++
			if (imageCount > COUNT_MAX)
				return
			console.log("langwing fetch ocr")
			// lines = await getOcr(base64)
			lines = await ocrSpaceAPI.ocrViaBase64(base64, 'eng', true)
			// lines = ["test"]
			// await imageCache.set(base64, {
			// 	'lines': lines
			// }).then()

			// const lines = await data

			// console.log("langwing", outputWidth, canvas.width)

			for (let i = 0; i < lines.length; i++) {
				let {x1, y1, width, height} = lines[i]

				// lines[i].x1 = x1 / outputWidth * canvas.width
				// lines[i].y1 = y1 / outputHeight * canvas.height
				// lines[i].width = width / outputWidth * canvas.width
				// lines[i].height = height / outputHeight * canvas.height

				if (x1 + width + lineWidth / 2 + 1 > canvas.width)
					lines[i].width = canvas.width - x1 - lineWidth / 2 - 1

				if (y1 + height + lineWidth / 2 + 1 > canvas.height)
					lines[i].height = canvas.height - y1 - lineWidth / 2 - 1
			}

			console.log("langwing lines", lines)

			// Compute groups

			const textAreas = groupLines(lines)

			console.log("langwing textAreas:", textAreas)

			for (let i = 0; i < textAreas.length; i++)
				textAreas[i].isTranslated = false


			// Render groups
			const textsTranslate = geminiTranslateTexts(textAreas.map((ta) => ta.text))

			// const context = canvas.getContext("2d")

			updateTextAreasRenderProps(context, textAreas)
			console.log("langwing debug textAreas", textAreas)
			renderTextAreas(context, textAreas)
			// console.log('debug width', canvas.width, canvas.height)
			updateImageElement(imgElement, canvas)
			imgElement.onclick = getImageOnClickFn(textAreas)
			await imageCache.set(base64, {
				'textAreas': textAreas
			})

			const textsTranslated = await textsTranslate

			console.log("Text Original:", textAreas.map((ta) => ta.text))
			console.log("Text Translated:", textsTranslated)

			for (let i = 0; i < textAreas.length; i++) {
				textAreas[i].text = textsTranslated[i]
				textAreas[i].isTranslated = true
				eraseTextArea(context, textAreas[i], originalImage)
			}


			updateTextAreasRenderProps(context, textAreas)
			renderTextAreas(context, textAreas)

			// const debugObserver = new MutationObserver((mutations) => {
			// 	for (const mutation of mutations) {
			// 		if (mutation.attributeName === 'src') {
			// 			console.log("Image src changed to:", imgElement.src);
			// 		}
			// 	}
			// })
			//
			// debugObserver.observe(imgElement, {
			// 	attributes: true,
			// 	attributeFilter: ['src']
			// })

			updateImageElement(imgElement, canvas)


			imageCache.set(base64, {
				'textAreas': textAreas
			})


		} catch (e) {
			throw e;
		}


	}


}

const observer = new MutationObserver(translateImageCallback);
observer.observe(document, {attributes: true, childList: true, subtree: true});
// observer.disconnect();

