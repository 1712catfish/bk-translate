// https://stackoverflow.com/questions/71571543/how-do-i-get-audio-from-a-web-page-that-is-playing
// https://stackoverflow.com/questions/49140159/extracting-audio-from-a-video-file
// https://stackoverflow.com/questions/34984501/get-audio-from-html5-video


// window.addEventListener('load', function () {
// 	console.log("langwing", "It's loaded!")
// 	let ytInitialPlayerResponse = window.ytInitialPlayerResponse
// 	console.log("langwing", ytInitialPlayerResponse)
// })

// TTS


const WAITING_FOR_TTS_RESPONSE = "waiting for tts response"

function isAudioPlaying(audio) {
	return !audio.paused && !audio.ended && audio.readyState > 2;
}

// const API_KEY = ""

const MAX_GG_TTS_API_CALL = 100

let api_call_count = 0

const TTS_CACHE = new Map()

async function synthesizeSpeech(text) {

	// console.log("langwing gg tts request sent:", text)

	const response = await fetch(
		"https://texttospeech.googleapis.com/v1beta1/text:synthesize", {
			method: "POST",
			headers: {
				"X-Goog-Api-Key": GG_TTS_API_KEY,
				"Content-Type": "application/json; charset=utf-8"
			},
			body: JSON.stringify({
				input: {
					text: text
				},
				voice: {
					languageCode: "vi-VN",
					name: "vi-VN-Chirp3-HD-Fenrir",
				},
				audioConfig: {audioEncoding: "LINEAR16"}
			})
		})

	if (!response.ok)
		return

	const result = await response.json()

	// console.log("langwing gg tts response ok:", text)

	return result["audioContent"]
}

async function tts(origContent, text) {
	TTS_CACHE.forEach((value, key) => console.log(key))

	if (TTS_CACHE.has(origContent)) {
		console.log("langwing tts", origContent, text, 'use cache')
		return TTS_CACHE.get(origContent)
	}

	api_call_count += 1

	if (api_call_count > MAX_GG_TTS_API_CALL)
		return WAITING_FOR_TTS_RESPONSE

	TTS_CACHE.set(origContent, WAITING_FOR_TTS_RESPONSE)
	console.log("langwing tts", origContent, text, 'gg tts')
	const audioContent = await synthesizeSpeech(text)
	console.log("langwing tts", origContent, text, 'gg tts ok')
	TTS_CACHE.set(origContent, audioContent)
	console.log("TTS_CACHE set")
	return audioContent

}

function playBase64Audio(base64Audio, playbackRate) {

	// Convert base64 to binary
	const byteCharacters = atob(base64Audio);
	const byteNumbers = new Uint8Array(byteCharacters.length);

	for (let i = 0; i < byteCharacters.length; i++) {
		byteNumbers[i] = byteCharacters.charCodeAt(i);
	}

	// Create a Blob from binary data
	const audioBlob = new Blob([byteNumbers], {type: "audio/wav"});
	const audioUrl = URL.createObjectURL(audioBlob);

	// Create and play the audio
	const audio = new Audio(audioUrl);

	audio.playbackRate = playbackRate
	audio.play()

	// audio.addEventListener('loadedmetadata', () => {
	// 	// let playbackRate = duration ? audio.duration / duration : 1
	// 	// if (playbackRate < 1) playbackRate = 1
	// 	// console.log("langwing play", audio.duration, duration, playbackRate)
	//
	//
	// 	// audio.play().then()
	// })

	// audio.play()

	return audio
}

// CONTEXT: Texts are extracted from a video's transcripts.


const TRANSCRIPT_TRANSLATE_PROMPT = `
CONTEXT: Texts are extracted from an HTML page.

TASK: Translate the texts back to Vietnamese.

FORMAT:
	Input is a string of Numbered List: 1) text\\n2) text\\n3) text... 
	There is no \\n after the last item. 
	Format output as a Numbered List, same as to input.
	Return the exact number of items in the output as the input.
	Only return the list, don't say anything else.
	Text may contain HTML tags. Return the HTML tags as they are. 
	Anything that looks like a tag but doesn't follow HTML tag format isn't a tag and should be translated.
	There may be Vietnamese texts within the list. If any list item is already in Vietnamese, return the same item. 
`

// const TRANSCRIPT_TRANSLATE_PROMPT = `
//
// TASK: Translate the texts back to Vietnamese.
//
// FORMAT:
// 	Input is a string of Numbered List: 1) text\\n2) text\\n3) text...
// 	There is no \\n after the last item.
// 	Format output as a Numbered List, same as to input.
// 	Return the exact number of items in the output as the input.
// 	Only return the list, don't say anything else.
// 	There may be Vietnamese texts within the list. If any list item is already in Vietnamese, return the same item.
//
// IMPORTANT:
// 	DO NOT JOIN ITEMS. RETURN THE EXACT NUMBER OF ITEM IN THE OUTPUT AS IN THE INPUT.
// `

function toNumberedList(strList) {
	return strList.map((item, index) => `${index + 1})\t${item}`).join('\n')
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

async function cerebrasVideoTranslateTextList(strList, chunkSize = 50) {

	// <svg class="ytp-heat-map-svg" height="100%" preserveAspectRatio="none" version="1.1" viewBox="0 0 1000 100" width="100%" style="height: 40px;"><defs><clipPath id="12"><path class="ytp-heat-map-path" d="M 0.0,100.0 C 0.0,93.3 -7.7,73.2 0.0,66.5 C 7.7,59.7 15.4,69.5 38.5,66.5 C 61.5,63.4 84.6,54.4 115.4,51.2 C 146.2,47.9 161.5,46.1 192.3,50.1 C 223.1,54.2 238.5,63.6 269.2,71.5 C 300.0,79.5 315.4,86.3 346.2,90.0 C 376.9,93.7 392.3,90.0 423.1,90.0 C 453.8,90.0 469.2,90.0 500.0,90.0 C 530.8,90.0 546.2,90.0 576.9,90.0 C 607.7,90.0 623.1,90.0 653.8,90.0 C 684.6,90.0 700.0,90.0 730.8,90.0 C 761.5,90.0 776.9,90.0 807.7,90.0 C 838.5,90.0 853.8,90.0 884.6,90.0 C 915.4,90.0 938.5,90.0 961.5,90.0 C 984.6,90.0 992.3,88.0 1000.0,90.0 C 1007.7,92.0 1000.0,98.0 1000.0,100.0" fill="white"></path></clipPath><linearGradient gradientUnits="userSpaceOnUse" id="ytp-heat-map-gradient-def" x1="0%" x2="0%" y1="0%" y2="100%"><stop offset="0%" stop-color="white" stop-opacity="1"></stop><stop offset="100%" stop-color="white" stop-opacity="0"></stop></linearGradient></defs><rect class="ytp-heat-map-graph" clip-path="url(#12)" fill="white" fill-opacity="0.4" height="100%" width="100%" x="0" y="0"></rect><rect class="ytp-heat-map-hover" clip-path="url(#12)" fill="white" fill-opacity="0.7" height="100%" width="100%" x="0" y="0"></rect><rect class="ytp-heat-map-play" clip-path="url(#12)" height="100%" x="0" y="0"></rect><path class="ytp-modern-heat-map" d="" fill="url(#ytp-heat-map-gradient-def)" height="100%" stroke="white" stroke-opacity="0.7" stroke-width="2px" style="display: none;" width="100%" x="0" y="0"></path></svg>

	const allTexts = []

	strList = strList.map(x => x.trim())

	for (let k = 0; k < strList.length; k += chunkSize) {
		const text = toNumberedList(strList.slice(k, k + chunkSize).reverse())

		console.log("langwing cerebra", text)

		const url = 'https://api.cerebras.ai/v1/chat/completions'

		// console.log("langwing", strList)

		const requestBody = {
			// model: "llama-3.3-70b",
			model: "llama3.1-8b",
			stream: false,
			max_tokens: 8192,
			temperature: 0.2,
			top_p: 1,
			messages: [
				// {
				// 	role: "system",
				// 	content: TRANSCRIPT_TRANSLATE_PROMPT
				// },
				{
					role: "user",
					content: TRANSCRIPT_TRANSLATE_PROMPT + " " + text
				},
			]
		}

		const response = await fetch(url, {
			method: 'POST',
			cache: 'force-cache',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${CEREBRAS_API_KEY}`
			},
			body: JSON.stringify(requestBody)
		})

		if (!response.ok) return ""

		const responseData = await response.json()

		const content = responseData["choices"][0]["message"]["content"]

		// console.log("langwing cerebras", `${text.slice(0, 20)}...${text.slice(-20)}`)

		console.log("langwing cerebras", content)

		allTexts.push(...fromNumberedList(content).reverse())


		// console.log("langwing cerebras test", content)
	}

	// console.log("langwing cerebras test", strList.length, allTexts.length)

	// console.log("langwing cerebras test", allTexts)

	// for (let k = 0; k < strList.length; k++) {
	// 	console.log("langwing cerebras", strList[k], allTexts[k])
	// }

	// console.log("langwing cerebras length", strList.length, allTexts.length)

	return allTexts

}

// Gemini

class VideoGeminiAPI {
	constructor() {
		// https://ai.google.dev/gemini-api/docs/text-generation?lang=python
		this.apiKey = GEMINI_API_KEY
		this.endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

		this.system_instruction = `Given a list of texts. 

Context: The texts are a Youtube video's transcripts.

Input format:
1) item 1
2) item 2
3) item 3
...

Output format:
start_0) translate sentence 1
start_1) translate sentence 2
start_2) translate sentence 3
...

Where start_i represents the index of the first item in the sentence.

Example output: 
1) Xin chào mọi người
3) Hôm nay mình sẽ nói chơi game.
4) Mọi người coi chung với mình nhe!
...

Only give me the exact same thing in the output format, nothing else.

Requirements:
Detect the items that belongs to the same sentence. Generate the start_i. 

For example, when joining items 1, 2, 3 and 4, 5 into two sentences, the result sentence should be "1) blab blab\n4) blab blab"

IMPORTANT: Only combine items if must. Otherwise, avoid combining items at all cost.

Then, take the joined sentence and give me back that sentence translated to Vietnamese.

Translation:
There may be sentences within the list already in Vietnamese. 
Translate every sentence that is in English.
If a sentence is in Vietnamese, do not translate that sentence. Return the joined sentence and go on to translate the rest.

Do for this:
`

	}

	async text2Text(text) {
		const url = `${this.endpoint}?key=${this.apiKey}`;

		console.log("langwing gemini request sent")

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				// "system_instruction": {"parts": {"text": this.system_instruction}},
				"contents": [{"parts": [{"text": this.system_instruction + " " + text}]}]
			})
		})

		if (!response.ok) {
			console.log("langwing gemini response not ok", response)
			throw Error("Gemini not ok!")
		}

		console.log("langwing gemini response ok", response)

		const content = await response.json()

		return content["candidates"][0]["content"]["parts"][0]["text"]

	}

}

// const GEMINI_TRANSLATE_PROMPT = `Given a list of texts.
//
// Context: The texts are a Youtube video's transcripts.
//
// Output format:
// t_0-n_0) translate sentence 1
// t_1-n_1) translate sentence 2
// t_2-n_2) translate sentence 3
// ...
//
// Where t_i and n_i represents the first index of the item in the sentence and the number of item combined into the sentence.
//
// Requirements:
// Do this one after another:
//
// Detect the items that belongs to the same sentence. Generate the index and the number of item in the sentence (t0-n0, t1-n1...).
//
// IMPORTANT: This must be true for all i: t1=t0+n0+1, t2=t1+n1+1..., t_i=t_(i-1)+n_*i-1)
//
// For example, you detected that items 0, 1, 2 belong to the same sentence. Then the index is "0-3)". 0 because it starts at item 0 and 3 because it contains 3 items.
//
// Pay attention to the end of sentence cues (dot, question mark...)
//
// IMPORTANT: Only combine items if must. Otherwise, avoid combining items at all cost.
//
// Then, take the joined sentence and give me back that sentence translated to Vietnamese.
//
// Translation:
// There may be sentences within the list already in Vietnamese.
// Translate every sentence that is in English.
// If a sentence is in Vietnamese, do not translate that sentence. Return the joined sentence and go on to translate the rest.
// `

// const GEMINI_TRANSLATE_PROMPT = `Given a list of texts.
//
// Context: The texts are a Youtube video's transcripts.
//
// Input format:
// 1) item 1
// 2) item 2
// 3) item 3
// ...
//
// Output format:
// start_0) translate sentence 1
// start_1) translate sentence 2
// start_2) translate sentence 3
// ...
//
// Where start_i is the index of the first item in the sentence and end_i represents the index of the last item in the sentence.
//
// Requirements:
// Detect the items that belongs to the same sentence. Generate the start_i and end_i of each sentence.
//
// IMPORTANT: This must be true for all i: start_1 = end_0 + 1, start_2 = end_1 + 1..., start_i = end_(i-1) + 1
//
// For example, when joining items 1, 2, 3, the result sentence must be indexed "1-3)". 1 because it starts at item 1 and 3 because it ends at item 3.
//
//
// Pay attention to the end of sentence cues (dot, question mark...)
//
// IMPORTANT: Only combine items if must. Otherwise, avoid combining items at all cost.
//
// Then, take the joined sentence and give me back that sentence translated to Vietnamese.
//
// Translation:
// There may be sentences within the list already in Vietnamese.
// Translate every sentence that is in English.
// If a sentence is in Vietnamese, do not translate that sentence. Return the joined sentence and go on to translate the rest.
// `


// Only return the translated sentences! Do not say anything else. Do not return the combined English sentences.
// Pay attention to the end of sentence cues (dot, question mark...)
// Only return the translated sentences. The combining process must be done internally.

const videoGeminiAPI = new VideoGeminiAPI()

function parseText(input) {
	const regex = /(\d+)\)\s(.+?)(?=\n|$)/g;
	const result = [];
	let match;

	while ((match = regex.exec(input)) !== null) {
		const index = parseInt(match[1], 10);
		const text = match[2].trim();
		result.push([index, text]);
	}

	return result;
}

async function videoGeminiTranslateTexts(texts) {
	throw new Error("Deprecated function");

	// let textString = ""
	// for (let i = 0; i < texts.length; i++) {
	// 	textString += `${i + 1}) ${texts[i]}\n`
	// }
	//
	// console.log("langwing textString", textString)
	//
	// const textStringTranslated = await videoGeminiAPI.text2Text(textString)
	//
	// // console.log(textString)
	// // console.log(textStringTranslated)
	//
	// console.log("langwing textStringTranslated", textStringTranslated)
	//
	// return parseText(textStringTranslated)
	//
	// return [...textStringTranslated.matchAll(/^\d+\) (.+)\n/gm)].map(match => match[1])
}

// Get Video Element

const videoElement = document.querySelector("video")

console.log("langwing", "videoElement", videoElement)

// Get Audio
// const audioContext = new AudioContext()
// const source = audioContext.createMediaElementSource(videoElement)
// const analyser = audioContext.createAnalyser()
// source.connect(analyser)
// source.connect(audioContext.destination)

// Get Transcript

function parseXMLtoJSON(xmlString) {
	const parser = new DOMParser();
	const xmlDoc = parser.parseFromString(xmlString, "text/xml");
	const texts = xmlDoc.getElementsByTagName("text");
	const result = [];

	for (let text of texts) {
		result.push({
			start: parseFloat(text.getAttribute("start")),
			duration: parseFloat(text.getAttribute("dur")),
			content: text.textContent
		});
	}


	return result
}

async function getYouTubeSubtitles() {
	const scripts = document.querySelectorAll("script")

	for (let script of scripts) {

		const scriptText = script.innerText
		const scriptTextHead = scriptText.substring(0, 100)
		// console.log("langwing", scriptTextHead)

		if (!scriptTextHead.includes("ytInitialPlayerResponse")) continue

		// let tempScript = document.createElement('script')
		// tempScript.innerHTML = scriptText
		// document.body.appendChild(tempScript)

		let i = 0
		let j = 0
		i = scriptText.indexOf("https://www.youtube.com/api/timedtext?")
		j = scriptText.indexOf('"', i)

		const url = scriptText.substring(i, j).replace(/\\u0026/g, "&")

		// console.log("langwing", "url", url)

		const response = await fetch(url)
		const transcriptXMLString = await response.text()

		// console.log("langwing", transcriptXMLString)

		return parseXMLtoJSON(transcriptXMLString)

	}
}

async function cleanAndTranslateTranscript(transcript, i0, n) {

	console.log("langwing clean and translate", i0, n)

	const tempElement = document.createElement("textarea");

	for (let i = i0; i < n; i++) {
		const t = transcript[i]
		tempElement.innerHTML = t.content
		t.content = tempElement.value
	}

	const transcriptText = transcript.slice(i0, n).map((t) => t.content)

	// const transcriptTextTranslated = await geminiTranslateTexts(transcriptText)
	const transcriptTextTranslated = await cerebrasVideoTranslateTextList(transcriptText)

	console.log("langwing to replace", transcriptText[0], '...', transcriptText.at(-1))
	console.log("langwing replace to", transcriptTextTranslated[0], '...', transcriptTextTranslated.at(-1))


	// let j = 0
	// for (let i = 0; i < n; i++) {
	// 	const t = transcript[i]
	//
	// 	if (j + 1 < transcriptTextTranslated.length && i === transcriptTextTranslated[j + 1][0]) {
	// 		j++
	// 	}
	//
	// 	if (t.origContent != null) continue
	//
	// 	t.origContent = t.content
	// 	t.content = transcriptTextTranslated[j][1]
	// 	t.startIndex = transcriptTextTranslated[j][0]
	// 	// t.endIndex = j + 1 < transcriptTextTranslated.length ? transcriptTextTranslated[j + 1][0] - 1 : transcript.length
	// 	t.endIndex = t.startIndex + 1
	//
	// }

	for (let i = i0; i < n; i++) {
		const t = transcript[i]

		t.origContent = t.content
		t.content = transcriptTextTranslated[i - i0]
		console.log("langwing replace", t.origContent, '=>', transcriptTextTranslated[i - i0])
		t.startIndex = i
		t.endIndex = i
	}

	// console.log("langwing t", transcript.slice(0, 20).map((x) => x.textContent))


	// console.log("langwing transcript", transcript)

}

let transcript
getYouTubeSubtitles().then((t) => {
	transcript = t
	if (transcript) {
		// for (let t of transcript.slice(0, 20)) {
		// 	console.log("langwing t", t.content)
		// }

	}

}).then(async () => {

	if (!transcript) return

	await cleanAndTranslateTranscript(transcript, 0, 10)
	if (transcript != null && transcript.length >= 1) {
		const {origContent, content} = transcript[0]
		if (content !== null && origContent !== null) {
			tts(origContent, content).then()
			console.log("langwing tts initial")
		}

	}

	for (let i = 10; i < transcript.length; i += 50) {
		await cleanAndTranslateTranscript(transcript, i, Math.min(i + 50, transcript.length))
	}

	// console.log("langwing translate", transcript.slice(0, 20))
})


// Render transcript

function createTranscriptArea() {
	const div = document.createElement("div")
	div.style.marginTop = "20px"
	div.style.marginBottom = "5px"
	div.style.position = "relative"
	div.innerHTML = `
    <div style="
        height: 40px;
        font-size: 17px;
        color: blue;
        word-wrap: break-word;
        margin-bottom: 5px;
    " class="langwing-translated">Phụ đề</div>
    <div style="
        height: 50px;
        font-size: 17px;
        color: black;
        word-wrap: break-word;
        line-height: 1.5;
    " class="langwing-translated"></div>
`
	return div
}

// Audio Functions

async function translateVideoCallback(mutationList, observer) {

	if (videoElement == null) return

	// observer.disconnect()

	if (videoElement.classList.contains('lw-stain')) return

	// videoElement.classList.add("langwing-translated")

	console.log("langwing video mutation trigger")

	const parentNode = document.getElementById("primary-inner")


	if (parentNode == null) return
	if (parentNode.classList.contains('lw-stain')) return

	parentNode.classList.add("langwing-translated")

	parentNode.classList.add("lw-stain");

	const transcriptArea = createTranscriptArea()

	parentNode.insertBefore(transcriptArea, parentNode.children[1])

	//

	videoElement.classList.add("lw-stain");

	let videoPlaying = true
	let audio

	videoElement.addEventListener('pause', () => {
		console.log('Video paused')
		videoPlaying = false
		if (audio)
			audio.pause()
	})

	videoElement.addEventListener('play', () => {
		console.log('Video playing')
		videoPlaying = true
		if (audio && isSpeaking)
			audio.play()
	})

	// let lastTranscriptId = -1
	let audioQueue = []
	let isSpeaking = false
	let currReadingId = -1
	// let currTimeId = -1
	let currTime

	// function queueHasSentence(sentenceId) {
	// 	for (let i = 0; i < audioQueue.length; i++) {
	// 		if (transcript[audioQueue[i][0]].startIndex === sentenceId) {
	// 			return true
	// 		}
	// 	}
	// 	return false
	// }

	async function enqueueAudioContent(trId) {

		// console.log("langwing audioQueue before enqueue", audioQueue.map((x) => x[0]), currReadingId, trId)

		if (currReadingId === trId) {
			return
		}

		if (trId + 1 >= transcript.length)
			return

		// for (let a of audioQueue) {
		// 	if (a[0] === trId)
		// 		return
		// }

		// console.log("langwing audioQueue before enqueue", audioQueue.map((x) => x[0]),
		// 	trId, audioQueue.map((x) => x[0]).includes(trId))

		if (audioQueue.map((x) => x[0]).includes(trId))
			return

		// console.log("langwing audioQueue before enqueue after return?", audioQueue.map((x) => x[0]),
		// 	trId, audioQueue.map((x) => x[0]).includes(trId))

		// if (queueHasSentence(transcript[trId].startIndex)) return

		const {origContent, content} = transcript[trId]
		const audioContent = await tts(origContent, content)
		// if (audioContent && audioContent !== WAITING_FOR_TTS_RESPONSE) {

		if (!audioQueue.map((x) => x[0]).includes(trId)) {
			audioQueue.push([trId, audioContent])
		}
		// }

		console.log("langwing audioQueue", audioQueue.map((x) => x[0]))

	}

	async function playNextInQueue() {
		if (isSpeaking || audioQueue.length === 0) return

		if (!videoPlaying) return

		const audioId = audioQueue[0][0]

		if (currTime < transcript[audioId].start)
			return

		let nextAudio = audioQueue[0][1]
		if (nextAudio === WAITING_FOR_TTS_RESPONSE) {
			const {origContent, content} = transcript[audioId]
			nextAudio = await tts(origContent, content)

		}

		if (nextAudio === WAITING_FOR_TTS_RESPONSE) {
			return
		}

		audioQueue.shift()

		isSpeaking = true

		console.log("langwing audio play", audioId, nextAudio.slice(0, 20), audioQueue.map((x) => x[0]))


		// Calculate play speed
		// const start = transcript[transcript[trId].startIndex]
		// const end = transcript[transcript[trId].endIndex]
		// console.log("langwing debug", transcript[trId], transcript.length)
		// const duration = end.start + end.duration - (start.start + currTime) / 2

		// const duration = transcript[trId]

		// console.log("langwing start end duration", start, end, duration)

		audio = playBase64Audio(
			nextAudio,
			currTime > transcript[audioId].start + transcript[audioId].duration / 2 ? 1.3 : 1)
		currReadingId = audioId


		audio.onended = () => {
			console.log("langwing audio stop", audioId, audioQueue.map((x) => x[0]))

			isSpeaking = false


			playNextInQueue() // Recursively play next

			// isSpeaking = false
		}
	}

	// function splitSentenceIntoN(sentence, n, k) {
	//
	// 	// console.log("langwing sentence n k", sentence, n, k)
	//
	// 	const words = sentence.split(/\s+/)
	// 	const wordCount = words.length
	//
	// 	if (wordCount < n || n === 1) {
	// 		return ["", sentence.trim(), ""]
	// 	}
	//
	// 	const wordsPerSubSentence = Math.floor(wordCount / n)
	// 	const remainder = wordCount % n
	// 	const subSentences = []
	// 	let startIndex = 0
	//
	// 	for (let i = 0; i < n; i++) {
	// 		let endIndex = startIndex + wordsPerSubSentence
	// 		if (i < remainder) {
	// 			endIndex++ // Distribute the remaining words
	// 		}
	// 		const subSentence = words.slice(startIndex, endIndex).join(" ")
	// 		subSentences.push(subSentence)
	// 		startIndex = endIndex
	// 	}
	//
	// 	// console.log("langwing sentence", sentence, subSentences, n, k)
	//
	// 	const charOverlap = 0
	//
	// 	if (charOverlap === 0) {
	// 		return [
	// 			subSentences.slice(0, k).join(" "),
	// 			" " + subSentences[k] + " ",
	// 			subSentences.slice(k + 1).join(" ")
	// 		]
	// 	}
	//
	// 	if (k === 0) {
	// 		const post = subSentences[1].split(/\s+/).slice(0, charOverlap).join(" ")
	// 		return ["",
	// 			subSentences[0] + " " + post,
	// 			subSentences.slice(1).join(" ").slice(post.length)
	// 		]
	//
	// 	} else if (k === subSentences.length - 1) {
	// 		const pre = subSentences[k - 1].split(/\s+/)
	// 			.slice(-charOverlap).join(" ")
	// 		return [
	// 			subSentences.slice(0, k).join(" ").slice(0, -pre.length),
	// 			pre + " " + subSentences[k],
	// 			""
	// 		]
	//
	// 	} else {
	// 		const pre = subSentences[k - 1].split(/\s+/)
	// 			.slice(-charOverlap).join(" ")
	// 		const post = subSentences[k + 1].split(/\s+/).slice(0, charOverlap).join(" ")
	//
	// 		return [
	// 			subSentences.slice(0, k).join(" ").slice(0, -pre.length),
	// 			pre + " " + subSentences[k] + " " + post,
	// 			subSentences.slice(k + 1).join(" ").slice(post.length)
	// 		]
	// 	}
	//
	// }

	videoElement.addEventListener('timeupdate', async () => {

		const isAdPlaying = document.querySelector('.ad-showing') !== null

		if (isAdPlaying) {
			console.log("langwing isAdPlaying")
			return
		}

		playNextInQueue()

		currTime = videoElement.currentTime

		// console.log("langwing", "timeupdate", currTime)

		// const timeDomainDataArray = new Float32Array(analyser.fftSize)
		// analyser.getFloatTimeDomainData(timeDomainDataArray)
		// console.log("langwing", timeDomainDataArray)

		if (transcript == null) return


		for (let trId = 0; trId < transcript.length; trId++) {

			const {start, duration, content, origContent} = transcript[trId]

			// console.log("langwing start cT cR", start, currTime, currReading, start + duration)

			if (start < currTime && currTime < start + duration) {

				// const sentenceId = transcript[trId].startIndex

				// currTimeId = sentenceId

				if (origContent != null)
					transcriptArea.firstElementChild.textContent = origContent

				if (content != null) {

					if (!audio || audio.duration === null || currReadingId !== trId) {
						transcriptArea.lastElementChild.innerHTML = content
					} else {

						// const n = transcript[trId].endIndex - transcript[trId].startIndex + 1
						// const k = Math.floor(audio.currentTime / audio.duration * n)

						// console.log("langwing k", k, audio.currentTime / audio.duration)

						// const [pre, curr, post] = splitSentenceIntoN(content,
						// 	transcript[trId].endIndex - transcript[trId].startIndex + 1,
						// 	trId - transcript[trId].startIndex
						// )
						// const [pre, curr, post] =
						// 	splitSentenceIntoN(content, n, k)
						// transcriptArea.lastElementChild.innerHTML =
						// 	`${pre}<span style="color: blue;">${curr}</span>${post}`

						transcriptArea.lastElementChild.innerHTML = content
					}
				}


				if (content == null || origContent == null) {
					// console.log("langwing content == null || origContent == null")
					return
				}

				// Update transcript area

				// transcriptArea.firstElementChild.textContent = content
				// transcriptArea.firstElementChild.textContent = splitSentenceIntoN(content,
				// 	transcript[trId].endIndex - transcript[trId].startIndex + 1,
				// 	trId - transcript[trId].startIndex
				// )
				// transcriptArea.lastElementChild.textContent = origContent


				// console.log("langwing sentenceId currReadingId", sentenceId, currReadingId)
				// console.log("langwing", audioQueue.map((x) => x[0]))

				if (trId === currReadingId) {
					// Enqueue next sentence
					// const nextSentenceId = transcript[sentenceId].endIndex + 1
					// if (nextSentenceId < transcript.length)
					console.log("langwing audio playing!", trId, transcript.length)
					if (trId + 1 < transcript.length)
						await enqueueAudioContent(trId + 1)
					return

				}

				// let lastSentenceIndex = 0
				// if (audioQueueId.length !== 0) {
				// 	lastSentenceIndex = audioQueueId[0].startIndex === 0 ? 0
				// 		: transcript[audioQueueId[0].startIndex-1].startIndex
				// }

				const audioQueueId = audioQueue.map((x) => x[0])
				if (currReadingId !== trId - 1 && !audioQueueId.includes(trId - 1)) {
					console.log("langwing audio skip detected!", currReadingId, trId)
					if (audio && isAudioPlaying(audio)) {
						audio.pause()
						audio.currentTime = 0
						audio = null
					}
					audioQueue = []
					isSpeaking = false
				}

				await enqueueAudioContent(trId, origContent, content)
				playNextInQueue()

				// lastTranscriptId = trId
				break

			}
		}

	})

	// observer.unobserve()

}

const translateVideoMutationObserver = new MutationObserver(translateVideoCallback);
translateVideoMutationObserver.observe(document, {attributes: true, childList: true, subtree: true});