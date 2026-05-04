def generate_feedback(topic: str, score: float) -> str:
    if score >= 85:
        return f"You are excellent in {topic}. You can move to the next topic."
    elif score >= 70:
        return f"You have a good understanding of {topic}, but a quick revision will help."
    elif score >= 50:
        return f"You need improvement in {topic}. Revise the summary and retry the assessment."
    else:
        return f"You are weak in {topic}. Rewatch the related video, review the summary, and attempt the quiz again."