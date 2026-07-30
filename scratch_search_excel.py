import os
import sys

# Add backend directory to path
sys.path.append(os.path.abspath("./backend"))

from core.utils import read_excel_robust

# Get search terms from command line arguments if provided
if len(sys.argv) > 1:
    search_terms = sys.argv[1:]
else:
    search_terms = ["7042", "NORTH PARAVOOR", "107042"]

search_dir = "/Users/aravinda/Downloads/PI RAW - JULY"

def main():
    print("Starting search using read_excel_robust...")
    count = 0
    matches = []
    
    for root, dirs, files in os.walk(search_dir):
        for file in files:
            if not (file.endswith(".xlsx") or file.endswith(".xls")):
                continue
            
            filepath = os.path.join(root, file)
            count += 1
            
            try:
                # Read first 15 rows, no header promotion (header=None)
                df = read_excel_robust(filepath, header=None, nrows=15)
                
                # Check rows 0 to 14 (mostly 4th row is row index 3, but let's check all row values for "Shop:")
                matched_in_file = False
                for row_idx, row in df.iterrows():
                    row_vals = [str(x).strip() for x in row.values if x is not None and not str(x).lower().strip() in ('nan', '')]
                    row_str = " | ".join(row_vals)
                    
                    # We are looking for "Shop:" or matching our terms in the row
                    # The user specifically mentioned: "Shop: {} which is mostly 4th row"
                    # "So I want to search 7042 or NORTH PARAVOOR or 107042 in that row for each file and get me the file name if found"
                    # Let's check if the row index is around 3 (4th row) or if "Shop:" or "Shop :" is in the row.
                    
                    is_candidate_row = False
                    if "shop" in row_str.lower() or "warehouse" in row_str.lower():
                        is_candidate_row = True
                    elif row_idx == 3: # 4th row (0-indexed)
                        is_candidate_row = True
                        
                    if is_candidate_row:
                        # Check if any search term is in this row
                        for term in search_terms:
                            if term.lower() in row_str.lower():
                                print(f"MATCH: {filepath} | Row {row_idx+1}: {row_str}")
                                matches.append((filepath, row_idx+1, row_str))
                                matched_in_file = True
                                break
                    if matched_in_file:
                        break
            except Exception as e:
                print(f"Error processing {filepath}: {e}")
                
    print(f"\nScan completed. Found {len(matches)} files matching the criteria out of {count} scanned files.")
    print("\nMatching files list:")
    for m in matches:
        print(f"- {m[0]} (Row {m[1]} content: {m[2]})")

if __name__ == "__main__":
    main()
