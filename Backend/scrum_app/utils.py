import openai
from datetime import datetime
import pandas as pd
import os
import json


EXCEL_FILE = "standup_meetings.xlsx"

def summarize_standup_conversation(conversation):
    """
    Given the whole conversation (list of {role, content}), ask GPT to extract a list of standup entries:
    [
      {"name":"John", "completed_yesterday":"...", "plan_today":"...", "blockers":"...", "summary":"..."},
      {...}
    ]
    """
    conversation_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in conversation])

    prompt = f"""Analyze this standup conversation and extract each participant's standup items.
Return ONLY a JSON array of objects. Each object must have keys:
"name", "completed_yesterday", "plan_today", "blockers", "summary".

The 'summary' field must always be a one-sentence recap of the participant's updates,
based on 'completed_yesterday', 'plan_today', and 'blockers'. Never write "Not specified" for summary.

If 'completed_yesterday', 'plan_today', or 'blockers' are missing, write "Not specified" for those fields
[
  {{
    "name": "John Doe",
    "completed_yesterday": "Finished auth API",
    "plan_today": "Work on UI",
    "blockers": "None",
    "summary": "John finished auth and will work on UI today"
  }},
  ...
]

Conversation:
{conversation_text}
"""

    response = openai.chat.completions.create(
        model="gpt-4",  # or "gpt-4o" if you have access
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3  # Lower temperature for more consistent JSON output
    )
    response_text = response.choices[0].message.content




    # strip possible code fences
    if '```' in response_text:
        response_text = response_text.split('```')[-2] if response_text.count('```') >= 2 else response_text.replace('```', '')

    try:
        parsed = json.loads(response_text.strip())
        if isinstance(parsed, dict):
            # if assistant returned single object, wrap it
            parsed = [parsed]
        return parsed
    except Exception as e:
        print("Failed to parse GPT output:", e)
        print("Raw:", response_text)
        # fallback: return minimal placeholder for each member? Return empty list here.
        return []
    
    
def save_standup_data(standup_list, excel_target):
    if not standup_list:
        return

    df_new = pd.DataFrame([{
        "Date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "Project Name": s.get("project_name", "Not specified"),
        "Name": s.get("name", "Not specified"),
        "Employee ID": s.get("employee_id", "Not specified"),
        "Completed Yesterday": s.get("completed_yesterday", "Not specified"),
        "Plan Today": s.get("plan_today", "Not specified"),
        "Blockers": s.get("blockers", "None"),
        "Summary": s.get("summary", "")
    } for s in standup_list])

    if isinstance(excel_target, str) and os.path.exists(excel_target):
        df_existing = pd.read_excel(excel_target)
        df_combined = pd.concat([df_existing, df_new], ignore_index=True)
        df_combined.to_excel(excel_target, index=False)
    elif hasattr(excel_target, "write"):
        # In-memory write
        df_new.to_excel(excel_target, index=False)
    else:
        # Initial creation
        df_new.to_excel(excel_target, index=False)