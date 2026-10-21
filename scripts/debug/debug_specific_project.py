from playwright.sync_api import sync_playwright
import time
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
        
        logs = []
        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: logs.append(f"[JS ERROR] {err.message}"))
        page.on("requestfailed", lambda req: logs.append(f"[REQ FAILED] {req.method} {req.url} - {req.failure.error_text}"))

        try:
            print("Logging in...")
            page.goto(BASE + '/login')
            page.fill('id=email', EMAIL)
            page.fill('id=password', PASSWORD)
            page.click('button[type="submit"]')
            
            time.sleep(3)
            
            project_url = BASE + '/projects/' + os.environ["PROJECT_ID"]
            print(f"Navigating to specific project: {project_url}")
            page.goto(project_url)
            time.sleep(5)
            
            # Find a task row
            # The previous check showed 'tr.group' is the pattern
            task_rows = page.locator('tr.group')
            count = task_rows.count()
            print(f"Found {count} tasks.")
            
            if count > 0:
                print("Clicking the first task...")
                task_rows.first.click()
                
                # Wait for dialog and potential crash
                time.sleep(5)
                
                print("\n--- Browser Logs (Console + JS + Network) ---")
                for log in logs:
                    print(log)
                
                # Take a screenshot to see the 'blank page' state
                page.screenshot(path=os.path.join(OUT, 'task_click_error.png'), full_page=True)
                print("Screenshot saved as task_click_error.png")
                
                # Inspect the dialog content
                dialog = page.locator('[role="dialog"]')
                if dialog.is_visible():
                    print(f"Dialog is visible. Inner HTML length: {len(dialog.inner_html())}")
                    # If it's a 'blank page', maybe it's an empty dialog or a specific error message
                else:
                    print("Dialog is NOT visible in the DOM.")
            else:
                print("No tasks found to click.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
