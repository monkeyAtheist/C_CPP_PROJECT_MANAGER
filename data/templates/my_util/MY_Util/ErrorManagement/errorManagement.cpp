/**
 * @file errorManagement.cpp
 * @brief Implementation of the errorManagement C++ bundle.
 *
 * Generated bundle implementation. Public API semantics are documented in the matching header file.
 */
#include "errorManagement.h"

jc_error::error jc_error::erreur;

void jc_error::error::printErrorLog()
{
	std::fstream f(this->path, std::ios::out | std::ios::trunc);
	f << "test";
}