import Foundation
import Screen2ReportCore

enum S2RCommand {
    case start
    case stop
    case status
}

func usage() -> String {
    """
    Usage:
      s2r start   Start the model server
      s2r stop    Stop the model server
      s2r status  Check model server status
    """
}

func parseCommand() throws -> S2RCommand {
    let args = Array(CommandLine.arguments.dropFirst())
    guard args.count == 1 else {
        throw S2RError.message(usage())
    }
    switch args[0] {
    case "start":
        return .start
    case "stop":
        return .stop
    case "status":
        return .status
    default:
        throw S2RError.message("Unknown command: \(args[0])\n\(usage())")
    }
}

func getPIDFile() -> URL {
    let baseDir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    return baseDir.appending(path: "run/model_server.pid")
}

func getLogFile() -> URL {
    let baseDir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    return baseDir.appending(path: "logs/model_server.log")
}

func resolveBinary(_ value: String) throws -> URL {
    if value.contains("/") {
        return URL(fileURLWithPath: value)
    }
    let which = try Shell.run("/usr/bin/which", [value])
    if which.exitCode == 0 {
        let resolved = which.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        if !resolved.isEmpty {
            return URL(fileURLWithPath: resolved)
        }
    }
    throw S2RError.message("failed to find '\(value)' in PATH")
}

func ensureLlamaServer(baseDir: URL) throws -> URL {
    // Prefer bundled runtime binary if present
    let bundled = baseDir.appending(path: "runtime/llama-server")
    if FileManager.default.isExecutableFile(atPath: bundled.path) {
        return bundled
    }

    // Try system PATH
    if let path = try? resolveBinary("llama-server") {
        return path
    }

    throw S2RError.message("llama-server not found. Please install llama.cpp or put llama-server at \(baseDir.path)/runtime/llama-server")
}

func getModelPath(baseDir: URL) throws -> URL {
    let modelsDir = baseDir.appending(path: "models")
    guard FileManager.default.fileExists(atPath: modelsDir.path) else {
        throw S2RError.message("models directory not found: \(modelsDir.path)")
    }

    // Find first subdirectory with .gguf files
    let contents = try FileManager.default.contentsOfDirectory(at: modelsDir, includingPropertiesForKeys: nil)
    for item in contents {
        var isDir: ObjCBool = false
        if FileManager.default.fileExists(atPath: item.path, isDirectory: &isDir), isDir.boolValue {
            let files = try FileManager.default.contentsOfDirectory(at: item, includingPropertiesForKeys: nil)
            if files.contains(where: { $0.pathExtension == "gguf" }) {
                return item
            }
        }
    }

    throw S2RError.message("no model found in \(modelsDir.path). Please run install.sh to download a model.")
}

func runStart() async throws {
    let baseDir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    let pidFile = getPIDFile()
    let logFile = getLogFile()

    // Check if already running
    if FileManager.default.fileExists(atPath: pidFile.path),
       let pidData = try? Data(contentsOf: pidFile),
       let pidStr = String(data: pidData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
       let pid = Int32(pidStr) {
        if kill(pid, 0) == 0 {
            print("[INFO] Model server already running (PID: \(pid))")
            return
        }
    }

    // Ensure directories exist
    try FileManager.default.createDirectory(at: pidFile.deletingLastPathComponent(), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: logFile.deletingLastPathComponent(), withIntermediateDirectories: true)

    // Get model path and llama-server binary
    let modelPath = try getModelPath(baseDir: baseDir)
    let llamaBinary = try ensureLlamaServer(baseDir: baseDir)
    let modelName = modelPath.lastPathComponent

    print("[INFO] Starting model server...")
    print("[INFO] Model: \(modelName)")
    print("[INFO] Log: \(logFile.path)")

    // Build command line
    let script = """
    #!/bin/bash
    cd "\(baseDir.path)"
    "\(llamaBinary.path)" \
        --host 127.0.0.1 \
        --port 8000 \
        --model "\(modelPath.appending(path: "\(modelName).gguf").path)" \
        --alias \(modelName) \
        > "\(logFile.path)" 2>&1 &
    echo $! > "\(pidFile.path)"
    """

    let scriptPath = baseDir.appending(path: ".start_server.sh")
    try script.write(to: scriptPath, atomically: true, encoding: .utf8)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptPath.path)

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/bash")
    process.arguments = [scriptPath.path]
    try process.run()
    process.waitUntilExit()

    // Clean up script
    try? FileManager.default.removeItem(at: scriptPath)

    // Wait a moment and check if started
    try await Task.sleep(nanoseconds: 1_000_000_000)

    if FileManager.default.fileExists(atPath: pidFile.path),
       let pidData = try? Data(contentsOf: pidFile),
       let pidStr = String(data: pidData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
       let pid = Int32(pidStr),
       kill(pid, 0) == 0 {
        print("[OK] Model server started (PID: \(pid))")
        print("[INFO] API: http://127.0.0.1:8000/v1")
    } else {
        print("[ERROR] Failed to start model server. Check log: \(logFile.path)")
        Foundation.exit(1)
    }
}

func runStop() throws {
    let pidFile = getPIDFile()

    guard FileManager.default.fileExists(atPath: pidFile.path),
          let pidData = try? Data(contentsOf: pidFile),
          let pidStr = String(data: pidData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
          let pid = Int32(pidStr) else {
        print("[INFO] No model server running")
        return
    }

    if kill(pid, 0) != 0 {
        print("[INFO] No model server running")
        try? FileManager.default.removeItem(at: pidFile)
        return
    }

    print("[INFO] Stopping model server (PID: \(pid))...")
    kill(pid, SIGTERM)

    // Wait for process to exit
    var attempts = 0
    while kill(pid, 0) == 0 && attempts < 10 {
        Thread.sleep(forTimeInterval: 0.5)
        attempts += 1
    }

    if kill(pid, 0) == 0 {
        print("[WARN] Server didn't stop gracefully, force killing...")
        kill(pid, SIGKILL)
    }

    try? FileManager.default.removeItem(at: pidFile)
    print("[OK] Model server stopped")
}

func runStatus() async throws {
    let pidFile = getPIDFile()
    let service = ModelService()

    guard FileManager.default.fileExists(atPath: pidFile.path),
          let pidData = try? Data(contentsOf: pidFile),
          let pidStr = String(data: pidData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
          let pid = Int32(pidStr),
          kill(pid, 0) == 0 else {
        print("[INFO] Model server: stopped")
        return
    }

    print("[INFO] Model server: running (PID: \(pid))")

    // Check health
    do {
        let _ = try await service.healthCheck(baseURL: "http://127.0.0.1:8000/v1")
        print("[OK] Health check: ready")
        print("[INFO] API: http://127.0.0.1:8000/v1")
    } catch {
        print("[WARN] Health check: not ready yet")
    }
}

@main
struct S2RCLIMain {
    static func main() async {
        do {
            let command = try parseCommand()
            switch command {
            case .start:
                try await runStart()
            case .stop:
                try runStop()
            case .status:
                try await runStatus()
            }
            Foundation.exit(0)
        } catch {
            fputs("[ERROR] \(error)\n", stderr)
            Foundation.exit(1)
        }
    }
}
