def make_recommendation(topic_name: str, mastery_percentage: float, related_videos: list[dict]) -> dict:
    if mastery_percentage >= 85:
        return {
            "status": "strong",
            "message": f"You are strong in {topic_name}. Move to the next topic.",
            "action": "next_topic",
            "recommended_videos": []
        }

    if mastery_percentage >= 60:
        return {
            "status": "moderate",
            "message": f"You have partial understanding of {topic_name}. Revise the summary and retry the assessment.",
            "action": "revise_and_retry",
            "recommended_videos": related_videos[:1]
        }

    return {
        "status": "weak",
        "message": f"You are weak in {topic_name}. Rewatch the related videos, revise the summary, and retry the assessment.",
        "action": "rewatch_and_retry",
        "recommended_videos": related_videos[:2]
    }