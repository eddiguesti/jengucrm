#!/bin/bash
# Convert .numbers files to CSV using AppleScript

SALES_NAV_DIR="/Users/edd/Documents/Jengu/sales navigator"

# Files that need conversion (don't have valid CSV yet)
FILES_TO_CONVERT=(
  "Costa Rica.numbers"
  "Spain.numbers"
)

for file in "${FILES_TO_CONVERT[@]}"; do
  input_path="$SALES_NAV_DIR/$file"
  output_name="${file%.numbers}.csv"
  output_path="$SALES_NAV_DIR/$output_name"

  if [ -f "$input_path" ]; then
    echo "Converting: $file -> $output_name"

    osascript <<EOF
tell application "Numbers"
  set theDoc to open POSIX file "$input_path"
  delay 2
  export theDoc to POSIX file "$output_path" as CSV
  close theDoc saving no
end tell
EOF

    if [ -f "$output_path" ]; then
      echo "  SUCCESS: $output_name created"
    else
      echo "  ERROR: Failed to create $output_name"
    fi
  else
    echo "SKIP: $file not found"
  fi
done

echo ""
echo "Conversion complete!"
