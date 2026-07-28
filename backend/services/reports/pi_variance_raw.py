from .base import BaseReportService

class PiVarianceRawService(BaseReportService):
    type_name = "pi_variance_raw"

    def process(self, report):
        month = report.get("config", {}).get("month")
        if not month:
            return

        from services.db import supabase
        from services.registry import get_service
        from api.routes import clean_nan

        try:
            # Find the main pi_variance report for the same month
            res = supabase.table("reports").select("*").eq("type", "pi_variance").execute()
            for r in (res.data or []):
                if r.get("config", {}).get("month") == month:
                    # Fetch all raw uploads to pass to the processor
                    res_raw = supabase.table("reports").select(
                        "id, name, type, status, config, uploads, created_at, path, file, storage_path"
                    ).eq("type", "pi_variance_raw").execute()
                    
                    r["all_reports"] = res_raw.data or []
                    
                    # Concurrently resolve and restore missing files from Supabase before processing
                    import os
                    import concurrent.futures
                    from api.routes import ensure_local_file
                    
                    def resolve_path(p):
                        if not p: return p
                        filename = os.path.basename(p)
                        temp_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "temp"))
                        return os.path.join(temp_dir, filename)

                    missing_pi_files = []
                    for raw_rep in r["all_reports"]:
                        for u in raw_rep.get("uploads", []):
                            if u.get("storage_path") and u.get("path"):
                                local_p = resolve_path(u["path"])
                                u["path"] = local_p
                                if not os.path.exists(local_p):
                                    missing_pi_files.append((u.get("storage_path"), local_p))
                                    
                    if missing_pi_files:
                        print(f"Fetching {len(missing_pi_files)} missing PI files from Supabase concurrently...")
                        with concurrent.futures.ThreadPoolExecutor(max_workers=15) as executor:
                            futures = [executor.submit(ensure_local_file, sp, lp) for sp, lp in missing_pi_files]
                            concurrent.futures.wait(futures)

                    # Run the processing logic of pi_variance
                    svc = get_service("pi_variance")
                    svc.process(r)
                    
                    r["status"] = "Processed"
                    r.pop("all_reports", None)
                    
                    # Save back to database using save_report helper
                    from api.routes import save_report
                    save_report(r)
                    print(f"DEBUG: Automatically processed output pi_variance report for {month}")
        except Exception as e:
            print(f"DEBUG: Error auto-processing pi_variance output report: {e}")

    def get_report(self, report, **kwargs):
        return {"data": [], "uploads": report.get("uploads", []), "config": report.get("config", {})}