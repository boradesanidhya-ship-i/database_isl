# SignLine Video & Skeleton Landmark Studio

An intelligent Indian Sign Language (ISL) studio featuring **Direct Video-to-Skeleton Database Storage**, real-time MediaPipe Holistic movement tracking on pure black background, instant PostgreSQL coordinate persistence (zero raw video storage), interactive skeleton replay animation, and direct ML pipeline inference.

---

## 🌟 Key Features

### 1. Direct Video-to-Skeleton Database Workflow (Zero Video Persistence)
- **Start Recording**: Activates camera and tracks movement frames temporarily in memory.
- **Track Movement**: Real-time MediaPipe Holistic pipeline extracts 33 Pose landmarks, 21 Left-Hand landmarks, 21 Right-Hand landmarks, and key facial contour points. Displayed on a dedicated pure black canvas (`#03050a`) with cyan pose, emerald left hand, violet right hand, and amber facial cues.
- **Stop Recording**: Continuously collected landmark sequence is validated ($\ge 5$ frames, detection thresholds) and automatically persisted directly to Supabase PostgreSQL.
- **Zero Video Persisted**: Raw video streams, camera frames, and rendered video clips are **immediately discarded** from memory and **never uploaded or stored** to disk or Cloud Storage.
- **Error Handling & Retry**: If network or database errors occur during save, a retry toast and manual retry button appear without losing the recorded sequence.
- **Skeleton Replay Player**: Reconstructs smooth 30 FPS skeleton animations on a black canvas directly from stored database coordinate arrays (no video file required). Includes frame scrubbing, speed control (0.5x, 1x, 1.5x, 2x), and loop playback.
- **Direct Model Inference**: Existing SignLine ISL recognition pipeline (`pipeline/infer_skeleton.py` and `pipeline/infer_skeleton_js.js`) classifies gestures directly from stored coordinate vectors with 95%+ confidence without video re-extraction.

---

## 🗄️ Database Architecture & Migrations

### `signline_skeleton_recordings` (PostgreSQL)
| Column | Type | Description |
|---|---|---|
| `id` | `UUID PRIMARY KEY` | Unique sequence ID |
| `user_id` | `UUID REFERENCES auth.users(id)` | Signer user ID (enforces RLS) |
| `action_label` | `TEXT` | Gesture name (e.g., "Namaste / Hello", "Thank You") |
| `purpose` | `TEXT` | `learning`, `communication`, or `custom_gesture` |
| `fps` | `NUMERIC(5,2)` | Recorded frames per second (default 30.0) |
| `frame_count` | `INTEGER` | Total temporal frames in sequence |
| `duration_seconds` | `NUMERIC(6,2)` | Elapsed duration |
| `movement_sequence` | `JSONB` | Array of temporal frames: `{ t, pose, lh, rh, face }` |
| `metadata` | `JSONB` | Tracker settings, resolution, zero_video_storage flag |
| `status` | `TEXT` | `completed`, `processing`, or `failed` |
| `custom_sign_id` | `UUID` | Link to custom sign definition |
| `created_at` | `TIMESTAMPTZ` | Timestamp |

### Row Level Security (RLS)
- Strict RLS enabled on `signline_skeleton_recordings`.
- Users authenticated via Supabase Auth can only read and write their own recordings (`auth.uid() = user_id`).
- Verified with cross-user isolation test scripts (`u1SeesU2: false`, `u2SeesU1: false`).

---

## 🚀 Running the Studio & Batch Commands

Use the unified launcher:
```bat
run.bat
```
Menu options:
- `[1] Start Camera Studio & Web App`: Starts local server at `http://localhost:3000` and launches browser.
- `[2] Sync Recorded Videos from Supabase to Local Dataset`
- `[3] Full Pipeline: Sync Database Videos & Retrain ML Model`
- `[4] Train ML Model Directly from Skeleton Database (Zero Video Files)`: Executes `pipeline/train_from_skeletons.js`.
- `[5] Install / Update Dependencies`
- `[6] Exit`

---

## 🧪 Verified Test Suite
- `apply_skeleton_migration.js`: Validated DDL migration and constraint adherence.
- `test_rls_isolation.js`: Validated multi-user Row Level Security isolation.
- `test_skeleton_api.js`: Validated sequence validation, storage, replay retrieval, and inference.
- `pipeline/train_from_skeletons.js`: Validated direct training from database sequences.

