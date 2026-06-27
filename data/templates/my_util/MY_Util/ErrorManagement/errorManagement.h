/**
 * @file errorManagement.h
 * @brief C++ configurable error logging helper.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * CPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - loads error/logging settings from an INI file;
 * - formats error messages with code, file, line and function;
 * - mirrors messages to stderr when configured;
 * - limits log size through a maximum number of log lines.
 *
 * @par Typical applications
 * - test applications that need consistent error traces;
 * - small C++ tools without a full logging framework;
 * - debug builds where file/function context is useful.
 *
 * @par Usage notes
 * - Use the provided macros when available so file, line and function are captured automatically.
 * - Keep the INI file near the executable or pass a known path during initialization.
 *
 * @par Example of use
 * @code{.cpp}
 * #include "errorManagement.h"
 * 
 * int run_with_error_log(void)
 * {
 *     jc_error::erreur.path = "errorLog.txt";
 *     set_error_(-12);
 *     return 0;
 * err:
 *     jc_error::erreur.printErrorLog();
 *     return jc_error::erreur.code;
 * }
 * @endcode
 */
#pragma once

#include <iostream>
#include <ostream>
#include <fstream>
#include <string>
#include <cstdio>
#include <ctime>

#include "../myUtil.h"

#define check_negerror(__x, __msg) do { \
    if ((erreur.code = __x) < 0) { \
        erreur.errorStatus = true; \
        erreur.message = (__msg); \
        std::cerr << "[" << jc_utility::now_timestamp() << "] " << erreur.message << std::endl; \
        jc_utility::append_error_log(erreur.path, erreur.code, erreur.message); \
        goto err; \
    } \
    else {erreur.code = 0;}\
} while(0)

#define check_zeroerror(__x, __msg) do {\
    if ((erreur.code = __x) == 0) {\
        erreur.errorStatus = true;\
        erreur.message = (__msg);\
        std::cerr << "[" << jc_utility::now_timestamp() << "] " << erreur.message << std::endl;\
        jc_utility::append_error_log(erreur.path, erreur.code, erreur.message);\
        goto err;\
    }\
    else {erreur.code = 0;}\
} while(0)

#define check_negzeroerror(__x, __msg) do { \
    if ((erreur.code = __x) <= 0) { \
        erreur.errorStatus = true; \
        erreur.message = (__msg); \
        std::cerr << "[" << jc_utility::now_timestamp() << "] " << erreur.message << std::endl; \
        jc_utility::append_error_log(erreur.path, erreur.code, erreur.message); \
        goto err; \
    } \
    else {erreur.code = 0;}\
} while(0)

#define check_negzerror_ret(__x, __msg) do { \
    if ((erreur.code = __x) <= 0) { \
        erreur.errorStatus = true; \
        erreur.message = (__msg); \
        std::cerr << "[" << jc_utility::now_timestamp() << "] " << erreur.message << std::endl; \
        jc_utility::append_error_log(erreur.path, erreur.code, erreur.message); \
        return erreur.code; \
    } \
    else {erreur.code = 0;}\
} while(0)

#define check_negerror_(__x) do { \
    if ((erreur.code = __x) < 0) { \
        erreur.errorStatus = true; \
        erreur.message = "Error code: " + std::to_string(__x); \
        std::cerr << "[" << jc_utility::now_timestamp() << "] " << erreur.message << std::endl; \
        jc_utility::append_error_log(erreur.path, erreur.code, erreur.message); \
        goto err; \
    } \
    else {erreur.code = 0;}\
} while(0)

#define set_error(__x, __msg) do { \
    erreur.code = (__x); \
    erreur.errorStatus = true; \
    erreur.message = (__msg); \
    std::cerr << "[" << jc_utility::now_timestamp() << "] " << erreur.message << std::endl; \
    jc_utility::append_error_log(erreur.path, erreur.code, erreur.message); \
    goto err; \
} while(0)

#define set_error_(__x) do { \
    erreur.code = (__x); \
    erreur.errorStatus = true; \
    erreur.message = "Error code: " + std::to_string(__x); \
    std::cerr << "[" << jc_utility::now_timestamp() << "] " << erreur.message << std::endl; \
    jc_utility::append_error_log(erreur.path, erreur.code, erreur.message); \
    goto err; \
} while(0)

namespace jc_error
{
	class error
	{
	public :
		error() { this->path = "errorLog.txt"; this->errorStatus = 0; this->code = 0; };
		~error() {};
		bool errorStatus;
		std::string message;
		int code;
		std::string path;
		std::tm* dateAndTime;
	
		void printErrorLog();

	private:
	protected:
	};

	extern error erreur;
}

using jc_error::erreur;


