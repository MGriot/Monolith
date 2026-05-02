import glob
import os

files = glob.glob('frontend/src/pages/*.tsx')
print(f"Found {len(files)} files")

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    new_content = content.replace("from '@/components/layout'", "from '@/context/title-context'")
    
    if content != new_content:
        with open(f, 'w', encoding='utf-8') as file:
            file.write(new_content)
        print(f"Updated {f}")
    else:
        print(f"No changes needed for {f}")
