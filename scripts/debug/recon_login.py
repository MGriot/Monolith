from playwright.sync_api import sync_playwright
import os

# Settings come from the environment, never from this file:
#   BASE_URL (default http://localhost:5173), MONOLITH_EMAIL, MONOLITH_PASSWORD
BASE = os.environ.get("BASE_URL", "http://localhost:5173").rstrip("/")
EMAIL = os.environ.get("MONOLITH_EMAIL", "")
PASSWORD = os.environ.get("MONOLITH_PASSWORD", "")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
os.makedirs(OUT, exist_ok=True)

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(BASE + '/login')
            page.wait_for_load_state('networkidle')
            
            print("--- Page Content Snapshot ---")
            print(page.content()[:2000]) # Print first 2k chars
            
            page.screenshot(path=os.path.join(OUT, 'login_page.png'), full_page=True)
            print("Screenshot saved as login_page.png")
            
            # Check for key elements
            username_input = page.locator('input[id="username"]')
            password_input = page.locator('input[id="password"]')
            login_button = page.locator('button[type="submit"]')
            
            print(f"Username input exists: {username_input.count() > 0}")
            print(f"Password input exists: {password_input.count() > 0}")
            print(f"Login button exists: {login_button.count() > 0}")
            
        except Exception as e:
            print(f"Error during reconnaissance: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
