import json
from groq import Groq
from youtube_transcript_api import YouTubeTranscriptApi

from app.config import settings


def fetch_transcript_text(video_id: str) -> str:
    """
    Fetch transcript text with fallback for multiple languages.
    This version is compatible with older youtube_transcript_api builds
    that use instance methods like fetch() and list().
    """
    ytt_api = YouTubeTranscriptApi()

    language_orders = [
        ["en-IN"],
        ["en"],
        ["en-US"],
        ["en-GB"],
        ["hi"],
        ["en-IN", "en", "en-US", "en-GB", "hi"],
    ]

    last_error = None

    # Try direct fetch first
    for langs in language_orders:
        try:
            fetched_transcript = ytt_api.fetch(video_id, languages=langs)

            text_parts = []
            for snippet in fetched_transcript:
                snippet_text = getattr(snippet, "text", None)
                if snippet_text:
                    text_parts.append(snippet_text.strip())

            text = " ".join(text_parts).strip()
            if text:
                return text

        except Exception as e:
            last_error = e
            continue

    # Fallback: list available transcripts and find matching one
    try:
        transcript_list = ytt_api.list(video_id)

        for langs in language_orders:
            try:
                transcript = transcript_list.find_transcript(langs)
                fetched_transcript = transcript.fetch()

                text_parts = []
                for snippet in fetched_transcript:
                    snippet_text = getattr(snippet, "text", None)
                    if snippet_text:
                        text_parts.append(snippet_text.strip())

                text = " ".join(text_parts).strip()
                if text:
                    return text

            except Exception as e:
                last_error = e
                continue

    except Exception as e:
        last_error = e

    raise ValueError(f"Could not retrieve transcript: {last_error}")


def summarize_transcript(transcript_text: str) -> str:
    if not settings.groq_api_key:
        raise ValueError("GROQ_API_KEY not set in .env")

    client = Groq(api_key=settings.groq_api_key)

    prompt = f"""
You are an educational assistant.

Summarize the following video transcript into:
1. Main concepts
2. Important definitions
3. Important steps or processes
4. Key takeaways

Write the summary in a clean, simple, student-friendly way.

Transcript:
{transcript_text[:12000]}
"""

    chat = client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": "You are an expert educational summarizer."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
    )

    content = chat.choices[0].message.content
    if not content:
        raise ValueError("Failed to generate summary")

    return content.strip()


def generate_mcqs_from_summary(summary_text: str) -> list[dict]:
    if not settings.groq_api_key:
        raise ValueError("GROQ_API_KEY not set in .env")

    client = Groq(api_key=settings.groq_api_key)

    prompt = f"""
You are an educational quiz generator.

Using the summary below, create exactly 5 multiple-choice questions.

Return ONLY valid JSON in this exact format:
[
  {{
    "question": "....",
    "option_a": "....",
    "option_b": "....",
    "option_c": "....",
    "option_d": "....",
    "correct_option": "A",
    "explanation": "...."
  }}
]

Rules:
- exactly 5 questions
- exactly 4 options for each question
- exactly 1 correct answer
- correct_option must be one of A, B, C, D
- questions should test understanding
- do not return markdown
- do not return extra text before or after JSON

Summary:
{summary_text[:8000]}
"""

    chat = client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {
                "role": "system",
                "content": "You generate educational quizzes in strict JSON format.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
    )

    content = chat.choices[0].message.content
    if not content:
        raise ValueError("Failed to generate MCQs")

    content = content.strip()

    if content.startswith("```json"):
        content = content[len("```json"):].strip()
    elif content.startswith("```"):
        content = content[len("```"):].strip()

    if content.endswith("```"):
        content = content[:-3].strip()

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON returned by Groq: {e}\nRaw output:\n{content}")

    if not isinstance(data, list):
        raise ValueError("Groq output is not a list of questions")

    required_keys = {
        "question",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "correct_option",
        "explanation",
    }

    if len(data) != 5:
        raise ValueError("Groq did not return exactly 5 questions")

    for i, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Question {i} is not a valid object")

        missing = required_keys - set(item.keys())
        if missing:
            raise ValueError(f"Question {i} is missing keys: {missing}")

        if item["correct_option"] not in {"A", "B", "C", "D"}:
            raise ValueError(f"Question {i} has invalid correct_option")

    return data