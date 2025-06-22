const AIProvider = {
	GROQ: 0,
	CEREBRAS: 1
}

function chatComplete(text, provider = AIProvider.GROQ, model = "gemma2-9b-it") {

	let url
	let apiKey

	if (provider === AIProvider.GROQ) {
		url = "https://api.groq.com/openai/v1/chat/completions"
		apiKey = GROQ_API_KEY
	} else if (provider === AIProvider.CEREBRAS) {
		url = 'https://api.cerebras.ai/v1/chat/completions'
		apiKey = CEREBRAS_API_KEY
	}

	const requestBody = {
		model: model,
		// model: "llama3.1-8b",
		stream: true,
		max_tokens: 8192,
		temperature: 0.2,
		top_p: 1,
		messages: [
			{
				role: "system",
				content: PAGE_TRANSLATE_PROMPT
			},
			{
				role: "user",
				content: text
			},
		]
	}

	return fetch(url, {
		method: 'POST',
		// cache: 'force-cache',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		},
		body: JSON.stringify(requestBody)
	})
}


const PAGE_TRANSLATE_PROMPT = `
CONTEXT: Texts are extracted from an HTML page.

TASK: Translate the texts back to Vietnamese.

FORMAT: 
	Input is a string of Numbered List: 1) text\\n2) text\\n3) text... 
	SPECIAL_TOKEN and ENTER_TOKEN should be left alone and returned the same
	There is no \\n after the last item.
	Format output as a Numbered List, same as to input.
	Return the exact number of items in the output as the input.
	Only return the list, don't say anything else.
	Text may contain HTML tags. Return the HTML tags as they are. 
	Anything that looks like a tag but doesn't follow HTML tag format isn't a tag and should be translated.
	There may be Vietnamese texts within the list. If an item is in Vietnamese, return the same item and proceed with the rest. 
	EVERYTHING IN ENGLISH MUST BE TRANSLATED!
`

function toNumberedList(strList) {
	return strList.map((item, index) => `${index + 1}) ${item}`).join('\n')
}

let count = 0

function collectTexts(node, callback) {
	if (!node || !node.parentNode)
		return

	if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE' || node.nodeName === 'NOSCRIPT')
		return

	if (node.nodeType === Node.COMMENT_NODE)
		return

	if (node.nodeType !== Node.TEXT_NODE) {
		for (let child of node.childNodes) {
			if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '') {
				collectTexts(child, callback)
				return
			}
		}
		node.childNodes.forEach(child => {
			collectTexts(child, callback)
		})
		return
	}

	if (node.textContent.trim().length === 0)
		return

	callback(node)

	// When parentNode doesn't have id (text nodes cannot have id)

	if (!node.parentNode.id) {
		count += 1;
		node.parentNode.id = `lw-t1-${count}`
	}

}

function cleanElement(node) {
	let result = ""

	node.childNodes.forEach((childNode) => {
		if (childNode.nodeType === Node.TEXT_NODE) {
			result += childNode.textContent
		} else if (childNode.nodeType === Node.ELEMENT_NODE) {
			childNode.classList.add("langwing-translated")
			const tag = childNode.tagName.toLowerCase()
			const inner = cleanElement(childNode)
			result += `<${tag}>${inner}</${tag}>`
		}
	})
	// console.log("langwing node2text", node, result)

	return result

}

class LWCache {
	constructor(maxItems = 1000) {
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
		const entries = Object.entries(sessionStorage)
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
		toRemove.forEach(entry => sessionStorage.removeItem(entry.key));

		// // Re-index kept items
		// toKeep.forEach((entry, index) => {
		// 	const newKey = `${this.prefix}${index}${this.suffix}`;
		// 	entry.value._timestamp = Date.now();
		// 	sessionStorage.setItem(newKey, JSON.stringify(entry.value));
		// 	if (entry.key !== newKey) {
		// 		sessionStorage.removeItem(entry.key);
		// 	}
		// });
	}

	// Sets a new entry using a hashed key
	async set(key, value) {
		const hashed = await this._hashKey(key);
		// console.log("langwing key hashed", hashed)
		const fullKey = `${this.prefix}${hashed}${this.suffix}`;
		const data = {...value, _timestamp: Date.now()};
		sessionStorage.setItem(fullKey, JSON.stringify(data));
		// this._init();
	}

	// Gets a value by hashed key
	async get(key) {
		const hashed = await this._hashKey(key);
		const fullKey = `${this.prefix}${hashed}${this.suffix}`;
		const raw = sessionStorage.getItem(fullKey);
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw);
			delete parsed._timestamp;
			return parsed;
		} catch {
			return null;
		}
	}


	clear() {
		Object.keys(sessionStorage).forEach(key => {
			if (key.startsWith(this.prefix) && key.endsWith(this.suffix)) {
				sessionStorage.removeItem(key);
			}
		});
	}
}

const pageTextCache = new LWCache(1000)

// pageTextCache.clear()

async function translateTNPList(tNPList, callback, provider = AIProvider.GROQ) {

	const SPECIAL_TOKEN = " SPECIAL_TOKEN "

	const textList = tNPList.map((tNP) => tNP.text
		.replace(/[^\p{L}\p{N}\p{P}\p{S}\s]/gu, SPECIAL_TOKEN)
		.replace("\n", " ENTER_TOKEN ")
	)

	const textRequest = toNumberedList(textList)

	let model
	if (provider === AIProvider.GROQ) {
		model = "gemma2-9b-it"
	} else {
		// model = "llama-3.3-70b"
		model = "llama3.1-8b"
	}

	const response = await chatComplete(textRequest, provider, model)

	if (!response.ok || !response.body) {
		console.log("langwing empty response")
		console.log(response)
		return ""
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()

	let buffer = ""

	let content = ""

	let currId = 0

	while (true) {
		const {done, value} = await reader.read()
		if (!done) {
			const decoded = decoder.decode(value, {stream: true})
			buffer += decoded

			const lines = buffer.split('\n')
			buffer = lines.pop()

			for (const line of lines) {
				if (line.startsWith("data:")) {
					const jsonStr = line.slice(6)
					// console.log("langwing jsonStr", jsonStr)

					if (jsonStr === "[DONE]") {
						break
					}

					try {
						content += JSON.parse(jsonStr)["choices"][0]["delta"]["content"] || ""

					} catch (error) {
						console.log("langwing jsonStr", jsonStr)
						throw error
					}

				}
			}
		}

		const contentLines = content.split('\n')

		// console.log("langwing chunk received", content)

		if (!done) {
			content = contentLines.pop()
		}

		for (let i = 0; i < contentLines.length; i++) {
			const contentLine = contentLines[i]
			const separatorIndex = contentLine.indexOf(')')
			if (separatorIndex !== -1) {
				const text = contentLine.slice(separatorIndex + 1)
					.replace(" ENTER_TOKEN ", "\n")

				const specialChars = []

				if (tNPList[currId] === undefined) {
					console.log("langwing undefined", contentLine)
					console.log("langwing undefined", textList, textRequest)
				}

				for (let ch of tNPList[currId].text) {
					if (!/[\p{L}\p{N}\p{P}\p{S}\s]/u.test(ch)) {
						specialChars.push(ch);
					}
				}

				let textSpecialChar = ""
				let modIndex = 0
				let specialCharIndex = 0

				// Step 2: Loop through the modified string and replace SPECIAL_TOKEN with the correct special characters
				while (modIndex < text.length) {
					const specialTokenIndex = text.indexOf(SPECIAL_TOKEN, modIndex)

					// If there's no SPECIAL_TOKEN left, append the rest of the modified string
					if (specialTokenIndex === -1) {
						textSpecialChar += text.slice(modIndex)
						break
					}

					// Append text before the SPECIAL_TOKEN
					textSpecialChar += text.slice(modIndex, specialTokenIndex)

					// Replace SPECIAL_TOKEN with the corresponding special character
					textSpecialChar += specialChars[specialCharIndex++] || ""; // Use the next special char from the original string

					// Move past the current SPECIAL_TOKEN
					modIndex = specialTokenIndex + SPECIAL_TOKEN.length;
				}

				// console.log("langwing replace\n", tNPList[currId].text, "=>\n", text, "=>\n", textSpecialChar)
				callback(tNPList[currId], textSpecialChar)


				if (textSpecialChar.length < 1000000) {
					const textEn = tNPList[currId].text
					pageTextCache.set(textEn, {"text": textSpecialChar})
						// .then(() => console.log("langwing cache set", textEn))
				}

				currId++
			}
		}

		// console.log("langwing end chunk")
		if (done) break
	}

	// console.log("langwing length test", tNPList.length, currId)
}


function replaceTextAnimated(node, text, color, steps = 10, delay = 50) {
	const length = text.length;

	function wait(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	async function update() {
		// const origBackgroundColor = node.parentNode.style.backgroundColor
		for (let i = 1; i <= steps; i++) {
			const charsToShow = Math.ceil((i / steps) * length);
			node.textContent  = text.slice(0, charsToShow)
			// node.parentNode.style.backgroundColor = color
			if (i < steps) {
				await wait(delay);
			}
		}

		if (node.textContent.length !== text.length) {
			console.log("langwing node.textContent.length !== text.length")
		}
		// node.parentNode.style.backgroundColor = origBackgroundColor
	}

	update();
}

async function translateNodes(textNodePList, batchSize = 125) {

	let provider = AIProvider.GROQ

	function replaceNodeRecursive(originalNode, newNode, useCache, typeEffectColor) {
		if (!originalNode || !newNode) return;

		// Skip comment nodes
		if (originalNode.nodeType === Node.COMMENT_NODE) return;

		const FONT_FAM = "Mali"

		// Handle text nodes
		if (originalNode.nodeType === Node.TEXT_NODE && newNode.nodeType === Node.TEXT_NODE) {
			if (useCache) {
				originalNode.parentNode.style.fontFamily = FONT_FAM
				// originalNode.parentNode.style.backgroundColor = "yellow"

				originalNode.textContent = newNode.textContent
			} else {
				originalNode.parentNode.style.fontFamily = FONT_FAM
				// originalNode.parentNode.style.backgroundColor = "yellow"

				replaceTextAnimated(originalNode, newNode.textContent, typeEffectColor)
			}
			return;
		}

		// If both nodes have children, recurse
		const originalChildren = originalNode.childNodes;
		const newChildren = newNode.childNodes;

		let i = 0, j = 0;

		while (i < originalChildren.length && j < newChildren.length) {
			const oChild = originalChildren[i];
			const nChild = newChildren[j];

			// Skip comment nodes in original
			if (oChild.nodeType === Node.COMMENT_NODE) {
				i++;
				continue;
			}

			replaceNodeRecursive(oChild, nChild, useCache, typeEffectColor);
			i++;
			j++;
		}
	}

	function updateNode(textNodeP, viText, useCache, provider) {
		const parser = new DOMParser()
		const tempDoc = parser.parseFromString(viText, 'text/html')

		const typeEffectColor = provider === AIProvider.GROQ ? "yellow" : "blue";

		// let k = 0, j = 0
		//
		// // console.log("langwing replace ele", textNodesParent[i].node.innerHTML, textListVi[i])
		// // console.log("langwing replace ele", textNodesParent[i].node.innerHTML, "=>", textListVi[i])
		//
		// while (k < newChildren.length && j < originalChildren.length) {
		//
		// 	const childNode = originalChildren[j]
		// 	if (childNode.nodeType === Node.COMMENT_NODE) {
		// 		j++
		// 		continue
		// 	}
		// 	const newChildNode = newChildren[k]
		//
		// 	if (childNode.nodeType === Node.TEXT_NODE && newChildNode.nodeType === Node.TEXT_NODE) {
		// 		// console.log("langwing replace node", childNode.textContent, '=>', newChildNode.textContent)
		//
		// 		// childNode.textContent = newChildNode.textContent
		// 		// wait(waitDuration)
		// 		// 	.then(() => childNode.textContent = newChildNode.textContent)
		//
		// 		if (useCache) {
		// 			childNode.textContent = newChildNode.textContent
		// 		} else {
		// 			replaceTextAnimated(childNode, newChildNode.textContent, typeEffectColor)
		// 		}
		//
		// 	} else if (childNode.firstChild && childNode.firstChild.textContent
		// 		&& newChildNode.firstChild && newChildNode.firstChild.textContent) {
		//
		// 		// wait(waitDuration)
		// 		// 	.then(() => childNode.firstChild.textContent = newChildNode.firstChild.textContent)
		// 		if (useCache) {
		// 			// NOT RECURSIVE!
		// 			childNode.firstChild.textContent = newChildNode.firstChild.textContent
		// 		} else {
		// 			replaceTextAnimated(childNode.firstChild, newChildNode.firstChild.textContent, typeEffectColor)
		//
		// 		}
		//
		// 		// console.log("langwing replace child", childNode.firstChild.textContent)
		//
		// 	} else {
		// 		// console.log("langwing text not replaced", childNode, newChildNode)
		// 	}
		// 	k++
		// 	j++
		// }

		replaceNodeRecursive(textNodeP.node, tempDoc.body, useCache, typeEffectColor);
	}

	for (let batchId = 0; batchId < textNodePList.length; batchId += batchSize) {

		const batch = []
		let batchCount = 0
		let j = 0

		while (batchCount < batchSize && batchId + j < textNodePList.length) {
			const tNP = textNodePList[batchId + j]
			j++

			const textCache = await pageTextCache.get(tNP.text)

			if (textCache !== null) {
				// console.log("langwing textCache found", textCache)
				updateNode(tNP, textCache["text"], true, null)
			} else if (!tNP.node.isConnected) {
				// Filter disconnected nodes
				console.log("langwing node disconnected!")
			} else {
				batch.push(tNP)
				batchCount++
			}
		}

		provider = provider === AIProvider.GROQ ? AIProvider.CEREBRAS : AIProvider.GROQ

		if (batch.length > 0) {
			translateTNPList(batch, (a, b) => updateNode(a, b, false, provider), provider)
			// .then(() => console.log("langwing mutationList Translated", batchId, j))

		}

	}
}

const mutationList = []

async function translateMutationList() {
	const mutationListFiltered = []

	for (let ele of mutationList) {
		if (!ele)
			continue
		if (!ele.parentNode)
			continue
		if (ele.parentNode.classList.contains("langwing-translated"))
			continue
		if (ele.classList && ele.classList.contains("langwing-translated"))
			continue
		mutationListFiltered.push(ele)
	}
	mutationList.length = 0

	const textNodesPList = []

	for (let ele of mutationListFiltered) {
		if (ele.nodeType !== Node.TEXT_NODE && ele.classList?.contains("langwing-translated"))
			continue

		collectTexts(ele, function (node) {

			if (node.nodeType === Node.COMMENT_NODE)
				return

			if (node.parentNode.classList.contains("langwing-translated"))
				return

			node.parentNode.classList.add("langwing-translated")
			// node.parentNode.style.backgroundColor = "yellow"

			const text = cleanElement(node.parentNode)

			if (text) {
				textNodesPList.push({
					node: node.parentNode,
					text: text,
				})
			}

		})
	}

	// console.log("langwing mutationListFiltered", textNodesPList)

	if (textNodesPList.length) {
		await translateNodes(textNodesPList)
		// await batchMapAsync(translateNodes, textNodesPList)

	}

}

mutationList.push(document.body)

translateMutationList().then()

setInterval(async () => {
	// console.log("langwing translate mutated elements")

	if (mutationList.length === 0)
		return

	await translateMutationList()

}, 2000)

const pageTranslateObserver = new MutationObserver((mu, ob) => {
	// console.log("langwing mutationList", mutationList)
	for (let m of mu) {
		mutationList.push(m.target)
	}
})

pageTranslateObserver.observe(document.body, {
	childList: true,
	characterData: true,
	subtree: true
})