from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        logs = []
        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: logs.append(f"[JS ERROR] {err.message}"))

        try:
            print("Logging in...")
            page.goto('http://localhost:5173/login')
            page.fill('id=email', 'admin@admin.com')
            page.fill('id=password', 'admin123')
            page.click('button[type="submit"]')
            
            time.sleep(5)
            print(f"Current URL after login attempt: {page.url}")
            
            # Go to projects
            page.goto('http://localhost:5173/projects')
            time.sleep(5)
            print(f"Projects Page URL: {page.url}")
            
            # Take screenshot of projects page
            page.screenshot(path='projects_debug.png')
            
            # Find the first project link
            project_link = page.locator('a[href^="/projects/"]').first
            if project_link.count() > 0:
                project_url = project_link.get_attribute('href')
                print(f"Navigating to project: {project_url}")
                page.goto(f"http://localhost:5173{project_url}")
                time.sleep(5)
                
                # Take a screenshot of the project page
                page.screenshot(path='project_page.png')
                
                # Find a task row to click. Based on the HTML, it has class 'group' and is a 'tr'
                # Let's try to click by text if possible, or just the first row
                task_row = page.locator('tr.group').first
                if task_row.count() > 0:
                    print("Clicking a task...")
                    task_row.click()
                    time.sleep(5)
                    
                    print("\n--- Browser Logs after clicking task ---")
                    for log in logs:
                        print(log)
                        
                    page.screenshot(path='task_dialog_debug.png')
                    print("Screenshot of task dialog saved as task_dialog_debug.png")
                    
                    # Check if DialogContent is visible
                    dialog_content = page.locator('[role="dialog"]')
                    print(f"Dialog visible: {dialog_content.is_visible()}")
                    if dialog_content.is_visible():
                        print(f"Dialog Inner Text: {dialog_content.inner_text()[:200]}")
                else:
                    print("No tasks found in project. Creating one...")
                    page.click('button:has-text("Add Task")')
                    time.sleep(5)
                    page.screenshot(path='create_task_dialog_debug.png')
                    print("Screenshot of create task dialog saved as create_task_dialog_debug.png")
                    print(f"Create Dialog visible: {page.locator('[role="dialog"]').is_visible()}")
                    for log in logs:
                        print(log)
            else:
                print("No projects found. Creating one...")
                # Try to create a project if none exist
                # ... skipping for now to see if we have projects
                pass

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
