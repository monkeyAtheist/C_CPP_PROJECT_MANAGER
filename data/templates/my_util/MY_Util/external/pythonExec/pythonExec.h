/**
 * @file pythonExec.h
 * @brief C++ Python execution bridge API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * CPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - launches Python as an external process;
 * - passes C++ string arguments to the script command line;
 * - captures stdout and optionally stderr into PythonExecResult.output;
 * - supports one-shot execution and persistent stdin/stdout sessions;
 * - offers line and JSON-style text exchange helpers.
 *
 * @par Typical applications
 * - calling Python analysis scripts from a C++ test program;
 * - delegating image processing, automation or data formatting to Python;
 * - keeping a long-running Python worker connected to a C++ application.
 *
 * @par Usage notes
 * - Python receives arguments through sys.argv[1:].
 * - print(...) output is captured in result.output for one-shot calls.
 * - Use unbuffered mode or flush=True for interactive sessions.
 *
 * @par Example of use
 * @code{.cpp}
 * #include "pythonExec.h"
 * #include <iostream>
 * 
 * jc_python::PythonConfig cfg;
 * cfg.scriptPath = "worker.py";
 * auto result = jc_python::PythonRunner::runScript(cfg, {"arg1", "arg2"}, 5000);
 * if (result.finished)
 * {
 *     std::cout << result.output << std::endl;
 * }
 * @endcode
 */
#pragma once

#include <cstdint>
#include <mutex>
#include <string>
#include <vector>

namespace jc_python {

    struct PythonConfig {
#if defined(_WIN32)
        std::string pythonExe = "python";
#else
        std::string pythonExe = "python3";
#endif
        std::string scriptPath;
        std::string workingDirectory;
        bool unbuffered = true;           // ajoute -u pour des échanges pipe plus fiables
        bool mergeStdErrToStdOut = true;  // stderr redirigé vers stdout
        int readTimeoutMs = 100;
        int writeTimeoutMs = 100;
    };

    struct PythonExecResult {
        bool launched = false;
        bool finished = false;
        bool timedOut = false;
        int exitCode = -1;
        std::string output; // stdout (+ stderr si fusionné)
    };

    class PythonRunner {
    public:
        static PythonExecResult runScript(const PythonConfig& cfg,
                                          const std::vector<std::string>& args = {},
                                          int timeoutMs = -1);
    };

    class PythonSession {
    public:
        PythonSession() = default;
        explicit PythonSession(const PythonConfig& cfg);
        ~PythonSession();

        PythonSession(const PythonSession&) = delete;
        PythonSession& operator=(const PythonSession&) = delete;

        PythonSession(PythonSession&& other) noexcept;
        PythonSession& operator=(PythonSession&& other) noexcept;

        bool start(const PythonConfig& cfg, const std::vector<std::string>& args = {});
        void close(bool forceKill = false);
        void closeInput();
        bool isRunning() const;
        int wait(int timeoutMs = -1);

        const PythonConfig& config() const { return cfg_; }

        int writeBytes(const uint8_t* data, size_t size);
        int writeString(const std::string& s);
        bool sendLine(const std::string& line);
        bool sendJson(const std::string& jsonLine);

        int readBytes(uint8_t* buffer, size_t maxSize, int timeoutMs = -1);
        bool readLine(std::string& outLine, int timeoutMs = -1, size_t maxLen = 8192);
        bool receiveJson(std::string& jsonLine, int timeoutMs = -1);

    private:
#if defined(_WIN32)
        using handle_t = void*;
        static constexpr handle_t kInvalidHandle = nullptr;
#else
        using handle_t = int;
        static constexpr handle_t kInvalidHandle = -1;
#endif

        PythonConfig cfg_{};
        mutable std::mutex ioMutex_;
        std::vector<uint8_t> rxBuffer_;

#if defined(_WIN32)
        handle_t processHandle_ = kInvalidHandle;
        handle_t threadHandle_ = kInvalidHandle;
#else
        int pid_ = -1;
#endif
        handle_t stdinWrite_ = kInvalidHandle;
        handle_t stdoutRead_ = kInvalidHandle;
        bool finished_ = false;
        int cachedExitCode_ = -1;

        void moveFrom_(PythonSession& other) noexcept;
        void closeHandle_(handle_t& h);
        int waitReadable_(int timeoutMs) const;
    };

} // namespace jc_python
