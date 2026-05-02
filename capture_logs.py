from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Capture console logs
        logs = []
        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: logs.append(f"[ERROR] {err.message}"))

        print("Navigating to http://localhost:5173/login...")
        try:
            page.goto('http://localhost:5173/login', wait_until='networkidle')
            # Wait a bit more for potential async rendering errors
            time.sleep(5)
            
            print("\n--- Browser Console Logs ---")
            for log in logs:
                print(log)
            
            print("\n--- Page Structure ---")
            root_html = page.locator('#root').inner_html()
            print(f"Root Div Inner HTML (length: {len(root_html)}):")
            print(root_html if root_html else "(empty)")
            
            page.screenshot(path='debug_console.png', full_page=True)
            
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
