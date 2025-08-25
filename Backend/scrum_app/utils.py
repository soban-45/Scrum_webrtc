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

    prompt = f"""You are a standup meeting analyzer. Extract information for each participant from this conversation.

CRITICAL REQUIREMENTS:
1. Return ONLY a valid JSON array, nothing else
2. No explanatory text before or after the JSON
3. Each participant must have exactly these keys: "name", "completed_yesterday", "plan_today", "blockers", "summary"

FORMAT EXAMPLE:
[
  {{
    "name": "John Doe",
    "completed_yesterday": "Finished authentication API development",
    "plan_today": "Work on user interface components",
    "blockers": "None",
    "summary": "John completed auth API and will work on UI today"
  }}
]

RULES:
- Extract each person's name, completed work, today's plan, and blockers
- If information is missing, use "Not specified" for that field
- Summary must be a concise sentence about their updates
- Names should be capitalized properly
- Return valid JSON only

Conversation to analyze:
{conversation_text}

Return JSON array:"""

    response = openai.chat.completions.create(
        model="gpt-4",  # or "gpt-4o" if you have access
        messages=[
            {"role": "system", "content": "You are a JSON-only response bot. You must return only valid JSON arrays with no additional text, explanations, or formatting."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1  # Very low temperature for consistent JSON output
    )
    response_text = response.choices[0].message.content




    # Clean and extract JSON from response
    print("Raw GPT Response:", response_text)  # Debug log
    
    # Strip possible code fences and extract JSON
    if '```json' in response_text:
        # Extract content between ```json and ```
        start = response_text.find('```json') + 7
        end = response_text.find('```', start)
        if end != -1:
            response_text = response_text[start:end].strip()
    elif '```' in response_text:
        # Handle generic code fences
        parts = response_text.split('```')
        if len(parts) >= 3:
            response_text = parts[1].strip()
        else:
            response_text = response_text.replace('```', '').strip()
    
    # Remove any leading/trailing whitespace and newlines
    response_text = response_text.strip()
    
    # Try to find JSON array/object in the text
    json_start = -1
    json_end = -1
    
    # Look for JSON array start
    if response_text.startswith('['):
        json_start = 0
        # Find matching closing bracket
        bracket_count = 0
        for i, char in enumerate(response_text):
            if char == '[':
                bracket_count += 1
            elif char == ']':
                bracket_count -= 1
                if bracket_count == 0:
                    json_end = i + 1
                    break
    # Look for JSON object start
    elif response_text.startswith('{'):
        json_start = 0
        # Find matching closing brace
        brace_count = 0
        for i, char in enumerate(response_text):
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    json_end = i + 1
                    break
    else:
        # Look for JSON somewhere in the text
        for i, char in enumerate(response_text):
            if char in '[{':
                json_start = i
                break
        
        if json_start != -1:
            if response_text[json_start] == '[':
                bracket_count = 0
                for i in range(json_start, len(response_text)):
                    if response_text[i] == '[':
                        bracket_count += 1
                    elif response_text[i] == ']':
                        bracket_count -= 1
                        if bracket_count == 0:
                            json_end = i + 1
                            break
            else:  # '{'
                brace_count = 0
                for i in range(json_start, len(response_text)):
                    if response_text[i] == '{':
                        brace_count += 1
                    elif response_text[i] == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            json_end = i + 1
                            break
    
    if json_start != -1 and json_end != -1:
        json_text = response_text[json_start:json_end]
    else:
        json_text = response_text
    
    print("Extracted JSON text:", json_text)  # Debug log
    
    try:
        parsed = json.loads(json_text)
        if isinstance(parsed, dict):
            # if assistant returned single object, wrap it
            parsed = [parsed]
        print("Successfully parsed JSON:", parsed)  # Debug log
        return parsed
    except Exception as e:
        print("Failed to parse GPT output:", e)
        print("Raw response:", response_text)
        print("Extracted JSON text:", json_text)
        
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