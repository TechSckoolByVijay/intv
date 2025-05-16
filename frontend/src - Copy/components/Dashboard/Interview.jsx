import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Stack,
  CircularProgress,
  Snackbar,
  Alert,
  IconButton,
  BottomNavigation,
  BottomNavigationAction,
  Tooltip,
  LinearProgress,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import MicIcon from "@mui/icons-material/Mic";
import VideocamIcon from "@mui/icons-material/Videocam";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import axios from "../../api";

// Dummy user id for demo; replace with real user context
const USER_ID = 1;

function useJDResumeStatus() {
  // Checks if JD and Resume are uploaded
  const [status, setStatus] = useState({ jd: false, resume: false, loading: true });
  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        await axios.get(`/api/files/preview/${USER_ID}/jd`, { responseType: "blob" });
        await axios.get(`/api/files/preview/${USER_ID}/resume`, { responseType: "blob" });
        if (mounted) setStatus({ jd: true, resume: true, loading: false });
      } catch {
        setStatus({ jd: false, resume: false, loading: false });
      }
    }
    check();
    return () => { mounted = false; };
  }, []);
  return status;
}

function AIQuestionAudio({ text }) {
  // Simple TTS using browser SpeechSynthesis
  const [playing, setPlaying] = useState(false);
  const utteranceRef = useRef(null);

  const handlePlay = () => {
    if (!window.speechSynthesis) return;
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    const utter = new window.SpeechSynthesisUtterance(text);
    utter.onend = () => setPlaying(false);
    utter.onerror = () => setPlaying(false);
    utteranceRef.current = utter;
    setPlaying(true);
    window.speechSynthesis.speak(utter);
  };

  useEffect(() => () => window.speechSynthesis.cancel(), [text]);

  return (
    <Tooltip title="AI Voice">
      <IconButton color="primary" onClick={handlePlay} size="large">
        <VolumeUpIcon fontSize="large" />
        {playing ? <PauseIcon /> : <PlayArrowIcon />}
      </IconButton>
    </Tooltip>
  );
}

function useMediaRecorder({ onStop }) {
  // Handles audio, video, and screen recording permissions and streams
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [streams, setStreams] = useState({});
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const start = async () => {
    setError("");
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      const video = await navigator.mediaDevices.getUserMedia({ video: true });
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setStreams({ audio, video, screen });
      // For demo, record only audio+video (not screen)
      const combinedStream = new MediaStream([
        ...audio.getAudioTracks(),
        ...video.getVideoTracks(),
        ...screen.getVideoTracks(),
      ]);
      const recorder = new MediaRecorder(combinedStream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        onStop && onStop(blob, streams);
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch (err) {
      setError("Permission denied or device not available.");
      setRecording(false);
    }
  };

  const stop = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      Object.values(streams).forEach((s) => s.getTracks().forEach((t) => t.stop()));
    }
  };

  useEffect(() => () => stop(), []); // Cleanup

  return { start, stop, recording, error };
}

export default function Interview() {
  // State
  const [interviewName, setInterviewName] = useState("");
  const [interviewId, setInterviewId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, msg: "", severity: "info" });
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [interviewDone, setInterviewDone] = useState(false);
  const jdResume = useJDResumeStatus();

  // Media recorder hook
  const { start, stop, recording, error } = useMediaRecorder({
    onStop: (blob) => setRecordingBlob(blob),
  });

  // Start new interview
  const handleCreateInterview = async () => {
    setLoading(true);
    try {
      const res = await axios.post("/interview", { interview_name: interviewName });
      setInterviewId(res.data.id);
      // Insert 3 questions
      const qres = await axios.post("/start_interview", {
        user_id: USER_ID,
        interview_id: res.data.id,
      });
      setQuestions(qres.data);
      setCurrentIdx(0);
      setSnackbar({ open: true, msg: "Interview started!", severity: "success" });
    } catch {
      setSnackbar({ open: true, msg: "Failed to start interview", severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Upload answer/recordings
  const handleUploadAnswer = async () => {
    if (!recordingBlob) return;
    setUploading(true);
    try {
      // Upload recording as file
      const file = new File([recordingBlob], `${USER_ID}-${interviewId}-${questions[currentIdx].question_id}.webm`);
      const formData = new FormData();
      formData.append("file", file);
      // For demo, just upload to /api/files/upload/{user_id}/answer (implement this in backend if needed)
      // await axios.post(`/api/files/upload/${USER_ID}/answer`, formData);
      // Instead, update DB with dummy path
      await axios.patch(`/question/${questions[currentIdx].id}`, {
        camera_recording_path: `uploads/${USER_ID}/${interviewId}/${USER_ID}-${interviewId}-${questions[currentIdx].question_id}.webm`,
        status: "ATTEMPTED",
      });
      setQuestions((prev) =>
        prev.map((q, i) =>
          i === currentIdx ? { ...q, status: "ATTEMPTED" } : q
        )
      );
      setSnackbar({ open: true, msg: "Answer uploaded!", severity: "success" });
      setRecordingBlob(null);
    } catch {
      setSnackbar({ open: true, msg: "Upload failed", severity: "error" });
    } finally {
      setUploading(false);
    }
  };

  // Next question or fetch more
  const handleNext = async () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((i) => i + 1);
      setRecordingBlob(null);
      return;
    }
    // Fetch more questions
    setLoading(true);
    try {
      const res = await axios.post("/more_questions", {
        user_id: USER_ID,
        interview_id: interviewId,
      });
      if (res.data.length === 0) {
        setInterviewDone(true);
      } else {
        setQuestions((prev) => [...prev, ...res.data]);
        setCurrentIdx((i) => i + 1);
      }
    } catch {
      setSnackbar({ open: true, msg: "Failed to fetch more questions", severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  // UI: Start page
  if (!interviewId) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", mt: 6 }}>
        <Paper elevation={8} sx={{ p: 4, borderRadius: 4 }}>
          <Typography variant="h4" color="primary" fontWeight={800} mb={2}>
            Start New Interview
          </Typography>
          <TextField
            label="Interview Name"
            value={interviewName}
            onChange={(e) => setInterviewName(e.target.value)}
            fullWidth
            sx={{ mb: 3 }}
            disabled={loading}
          />
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <CheckCircleIcon color={jdResume.jd ? "success" : "disabled"} />
            <Typography>JD Uploaded</Typography>
            <CheckCircleIcon color={jdResume.resume ? "success" : "disabled"} />
            <Typography>Resume Uploaded</Typography>
          </Stack>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddCircleOutlineIcon />}
            disabled={
              !interviewName ||
              !jdResume.jd ||
              !jdResume.resume ||
              loading ||
              jdResume.loading
            }
            onClick={handleCreateInterview}
            sx={{ fontWeight: 700, fontSize: 18, px: 4, py: 1.5 }}
          >
            {loading ? <CircularProgress size={24} /> : "Create Interview"}
          </Button>
        </Paper>
        <Snackbar
          open={snackbar.open}
          autoHideDuration={3000}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          <Alert severity={snackbar.severity}>{snackbar.msg}</Alert>
        </Snackbar>
      </Box>
    );
  }

  // UI: Interview done
  if (interviewDone) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", mt: 8, textAlign: "center" }}>
        <CheckCircleIcon color="success" sx={{ fontSize: 80, mb: 2 }} />
        <Typography variant="h4" fontWeight={800} color="success.main" mb={2}>
          Congratulations!
        </Typography>
        <Typography mb={3}>
          Your interview is complete. Your report is being prepared.
        </Typography>
        <Button
          variant="contained"
          color="primary"
          size="large"
          href="/performance"
        >
          Go to Performance Tab
        </Button>
      </Box>
    );
  }

  // UI: Interview flow
  const q = questions[currentIdx];
  const morePending = questions.some((q, idx) => q.status === "NEW" && idx > currentIdx);

  if (!questions.length || !q) {
    // Show loading or a friendly message
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", mt: 8, textAlign: "center" }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="h6">Loading questions...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 700, mx: "auto", mt: 4 }}>
      <Paper elevation={10} sx={{ p: 4, borderRadius: 4, mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2} mb={2}>
          <AIQuestionAudio text={q.question_text} />
          <Typography variant="h6" fontWeight={700}>
            Question {currentIdx + 1}:
          </Typography>
        </Stack>
        <Typography variant="body1" sx={{ mb: 3, fontSize: 20 }}>
          {q.question_text}
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" mb={2}>
          <Tooltip title="Record Audio">
            <MicIcon color={recording ? "primary" : "disabled"} />
          </Tooltip>
          <Tooltip title="Record Camera">
            <VideocamIcon color={recording ? "primary" : "disabled"} />
          </Tooltip>
          <Tooltip title="Record Screen">
            <ScreenShareIcon color={recording ? "primary" : "disabled"} />
          </Tooltip>
          <Button
            variant={recording ? "outlined" : "contained"}
            color={recording ? "error" : "primary"}
            startIcon={recording ? <PauseIcon /> : <MicIcon />}
            onClick={recording ? stop : start}
            disabled={uploading}
            sx={{ ml: 2, fontWeight: 700 }}
          >
            {recording ? "Stop Recording" : "Start Recording"}
          </Button>
        </Stack>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {recordingBlob && (
          <Box sx={{ mb: 2 }}>
            <video
              src={URL.createObjectURL(recordingBlob)}
              controls
              style={{ width: "100%", maxHeight: 240, borderRadius: 8 }}
            />
            <Button
              variant="contained"
              color="success"
              onClick={handleUploadAnswer}
              disabled={uploading}
              sx={{ mt: 2, fontWeight: 700 }}
            >
              {uploading ? <CircularProgress size={20} /> : "Upload Answer"}
            </Button>
          </Box>
        )}
        <LinearProgress
          variant="determinate"
          value={((currentIdx + 1) / questions.length) * 100}
          sx={{ mb: 2 }}
        />
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Typography color="text.secondary">
            {morePending && "More pending questions available"}
          </Typography>
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            onClick={handleNext}
            disabled={recording || uploading}
          >
            Next
          </Button>
        </Stack>
      </Paper>
      <BottomNavigation
        showLabels
        value={currentIdx}
        sx={{
          borderRadius: 3,
          boxShadow: 2,
          background: "#232b3b",
          mb: 2,
        }}
      >
        {questions.map((q, idx) => (
          <BottomNavigationAction
            key={q.id}
            label={idx + 1}
            icon={
              q.status === "ATTEMPTED" ? (
                <CheckCircleIcon color="success" />
              ) : (
                <PlayArrowIcon />
              )
            }
            sx={{
              color: idx === currentIdx ? "primary.main" : "text.secondary",
              fontWeight: idx === currentIdx ? 700 : 400,
            }}
            onClick={() => setCurrentIdx(idx)}
          />
        ))}
      </BottomNavigation>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity}>{snackbar.msg}</Alert>
      </Snackbar>
    </Box>
  );
}