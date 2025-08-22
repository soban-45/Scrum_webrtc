import os
import sys
import time
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

load_dotenv()

BOT_EMAIL = os.getenv("BOT_EMAIL")
BOT_PASSWORD = os.getenv("BOT_PASSWORD")
MEET_URL = sys.argv[1] if len(sys.argv) > 1 else None

def join_meet_auto(meet_url):
    with sync_playwright() as p:
        # 🚀 Disable mic & camera
        browser = p.chromium.launch(
            headless=False,

        )

        # deny default camera & mic permissions for meet.google.com
        context = browser.new_context(
            permissions=[]  # no camera/microphone permissions granted
        )
        page = context.new_page()

        # --- Google Login ---
        page.goto("https://accounts.google.com/")
        page.fill('input[type="email"]', BOT_EMAIL)
        page.click('#identifierNext')
        page.wait_for_timeout(2000)

        page.fill('input[type="password"]', BOT_PASSWORD)
        page.click('#passwordNext')
        page.wait_for_timeout(5000)

        # --- Go to Meet URL ---
        page.goto(meet_url)
        
        page.wait_for_timeout(5000)

        try:
            page.wait_for_selector('text="Continue without microphone and camera"', timeout=5000)
            page.click('text="Continue without microphone and camera"')
            print("✅ Chose 'Continue without microphone and camera'")
        except:
            print("ℹ️ No mic/camera popup appeared")

        # 🔇 No need to click mic/cam off → already disabled by launch args
        print("✅ Mic & Camera disabled by default, bot will stay silent.")

        # --- Auto request to join ---
        join_buttons = [
            'text="Ask to join"',
            'text="Join now"',
            'button:has-text("Join")',
            'button:has-text("Ask to join")'
        ]
        clicked = False
        for btn in join_buttons:
            try:
                page.click(btn, timeout=5000)
                print(f"✅ Bot clicked: {btn}")
                clicked = True
                break
            except:
                continue

        if not clicked:
            print("⚠️ Could not find join button, might be auto-joined already")

        print("✅ Bot is now waiting for host to admit...")

        # --- Keep bot alive until meeting ends ---
        while True:
            time.sleep(30)

if __name__ == "__main__":
    if MEET_URL:
        join_meet_auto(MEET_URL)
    else:
        print("❌ No meet URL provided")


