// Tab switching cache

const searchBox = document.getElementById('searchBox')
const dropdown = document.getElementById('dropdown')
const enBox = document.getElementById('enBox')

const suCache = new Map()

let timeoutId = null

async function fetchSuggestions(query) {

	console.time(`fetch-sugg`)

	if (suCache.has(query)) {
		const [qT, su, suVi] = suCache.get(query)
		enBox.textContent = `Tiếng anh là: ${qT}`
		showDropdown(suVi, su)
		return
	}

	const queryTranslated = await translateText(query, "vi", "en")

	enBox.textContent = `Tiếng anh là: ${queryTranslated}`

	getGoogleSuggestions(queryTranslated, "us", async function (res) {
		const suggestions = res[1]
		const suggestionsVi = await translateSuggestions(
			query, queryTranslated, suggestions)
		suCache.set(query, [queryTranslated, suggestions, suggestionsVi])
		showDropdown(suggestionsVi, suggestions)

		// enBox.textContent = `Tiếng anh là: ${queryTranslated} ${suggestions.length} ${suggestionsVi.length}`
	})


}

searchBox.addEventListener('input', async (e) => {
	clearTimeout(timeoutId)

	const query = e.target.value

	if (!query.trim()) {
		dropdown.style.display = 'none'
		dropdown.innerHTML = ''
		return
	}

	const lastChar = query.slice(-1)
	if (lastChar !== ' ' && lastChar !== '\t') {
		timeoutId = setTimeout(async () => {
			console.log('1s passed')
			await fetchSuggestions(query.trim())
		}, 300)
		return
	}
	await fetchSuggestions(query.trim())

})

async function getGoogleSuggestions(query, gl, callback) {
	const queryEncoded = query.split(" ").join("+")
	const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${queryEncoded}&gl=${gl}`

	const response = await fetch(url)

	const responseData = await response.json()

	console.log(responseData)

	callback(responseData)

}

function showDropdown(suggestionsVi, suggestionsEn) {

	dropdown.innerHTML = ''

	if (suggestionsVi.length === 0) {
		dropdown.style.display = 'none'
		return
	}

	dropdown.style.display = 'block'

	for (let i = 0; i < suggestionsVi.length; i++) {
		const suggestionEn = suggestionsEn[i]
		const suggestionVi = suggestionsVi[i]

		const div = document.createElement('div')
		div.className = 'dropdown-item'

		const text = document.createElement('div')
		text.textContent = suggestionVi
		div.appendChild(text)

		dropdown.appendChild(div)

		const textEn = document.createElement('div')
		textEn.textContent = suggestionEn
		textEn.style.color = "blue"
		textEn.style.visibility = 'hidden'
		div.appendChild(textEn)

		div.addEventListener('mouseover', function () {
			textEn.style.visibility = 'visible'
		})
		div.addEventListener('mouseout', () => {
			textEn.style.visibility = 'hidden'
		})

		div.addEventListener('click', () => createOrSwitchToTab(suggestionEn)
		)
	}

	console.timeEnd(`fetch-sugg`)
}

async function createOrSwitchToTab(query) {
	chrome.tabs.query({}, tabs => {

		chrome.tabs.query({}).then((tabs) => {
			tabs.forEach(tab => {
				console.log(tab.title)
			})
		})

		const tab = tabs.find(tab => tab.title === `${query} - Google Search`)

		if (tab) {
			chrome.tabs.update(tab.id, {active: true})
			// chrome.windows.update(tab.windowId, { focused: true })
			return
		}

		const queryEncoded = query.split(' ').join('+')
		const url = `https://www.google.com/search?q=${queryEncoded}`

		chrome.tabs.create({url})
	})
}

async function translateText(text, source = 'vi', target = 'en') {

	const res = await fetch(
		`https://translation.googleapis.com/language/translate/v2?key=${GG_TRANSLATE_API_KEY}`, {
			// cache: 'force-cache',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				q: text,
				target: target,
				source: source,
				format: 'text',
			})
		})

	const data = await res.json()
	// console.log(data)
	const query = data.data.translations[0].translatedText
	enBox.textContent = query
	return query
}

async function cerebrasTranslateSuggestions(queryKeyVi, queryKeyEn, suggestionsFormatted) {
	const apiKey = CEREBRAS_API_KEY
	const url = 'https://api.cerebras.ai/v1/chat/completions'

	// Query key (VI): ${queryKeyVi}
	// Query key (EN): ${queryKeyEn}

	const content = `Query suggestions (EN):
	${suggestionsFormatted}
	`
	const requestBody = {
		model: "llama-3.3-70b",
		stream: false,
		max_tokens: 2048,
		temperature: 0.2,
		top_p: 1,
		messages: [
			{
				role: "system",
				content: `
Task: Translate the list below from English to Vietnamese.

Format: A string of Numbered List: 1) text\\n2) text\\n3) text... There is no \\n after the last item. 
Format the output the same as the input Numbered List.
Return the exact number of items in the output as the input.
Only return the list, don't say anything else.`
			},
			{
				role: "user",
				content: content
			},
		]
	}

	const response = await fetch(url, {
		method: 'POST',
		cache: 'force-cache',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		},
		body: JSON.stringify(requestBody)
	})

	if (!response.ok)
		return ""

	const responseData = await response.json()

	return responseData["choices"][0]["message"]["content"]

}

async function translateSuggestions(
	queryKeyVi, queryKeyEn, suggestions, provider = "cerebras") {

	const suggestionsFormatted = toNumberedList(suggestions)

	let suggestionsVi = []

	if (provider === "cerebras") {
		const suggestionsViFormatted = await
			cerebrasTranslateSuggestions(queryKeyVi, queryKeyEn, suggestionsFormatted)

		suggestionsVi = fromNumberedList(suggestionsViFormatted)
	}

	return suggestionsVi
}

function toNumberedList(items) {
	return items.map((item, index) => `${index + 1}) ${item}`).join('\n')
}

function fromNumberedList(str) {
	const lines = str.split('\n')
	const result = []

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim()
		const separatorIndex = line.indexOf(')')
		if (separatorIndex !== -1) {
			const item = line.slice(separatorIndex + 1).trim()
			result.push(item)
		}
	}

	return result
}
