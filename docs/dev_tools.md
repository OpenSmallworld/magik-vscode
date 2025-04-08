# Magik development scripts

This repository provides a couple of useful scripts for starting magik sessions and a set procedures and shortcuts to facililtate Magik development.
The procedures support both vscode and emacs although we recommend that VS Code is used for Magik development.
Some require that and the build_tools repo exists in **C:/projects/hg/build_tools.**

> Please add common scripts together with a description to this readme.
> Please include documentation and example usage in the scripts.

### Assumptions

Smallworld is installed in a directory path with the following format:

C:\Smallworld\version\date

e.g.

C:\Smallworld\SW600\2025_04_02

The PROJECTS_DIR environment variable is set to the root where source code is located

e.g. C:\projects\hg

## Scripts

### local_magik.bat

This is a script to start a Magik session from a local installation.

The script finds the latest install from the last 14 days. 


#### Arguments:

| command          | description                                 |
| ---------------- | ------------------------------------------- |
| `name`         | identify the session to be used             |
| `-debug`       | enable debugger                             |
| `-java_debug`  | enable java debugging                       |
| `-version=NNN` | choose a different version from the default |
| `-days=N`      | run a version from n days ago               |
| `-vvmds`       | run in VVMDS mode                           |
| `-noinit`      | do not open the database                    |
| `-no_login`    | do not log in                               |
| `-use_s`       | Run the latest deployment on the S: drive   |
| `-print`       | just write out the runalias command         |

For available sessions use:
`local_magik -help`

Most of the available sessions open the installed database.

Some are named ***no_db** and require a DB to be configured for opening (see [local product](local_product.bat))

#### Examples of use:

To start the Cam DB application:
`local_magik cam`

To start a debug session of PNI:
`local_magik pni -debug`

### local_product.bat

Used to configure a session to load products from local repositories and/or to point at a specific DB. local_product can be invoked mulriple times to use as many local products as required.

#### Examples of use:

To load from a local EO product:
`local_product eo`

To see which products are configured for a local load:
`local_product -print`

To reset, i.e. load from installed product:
`local_product unset`

To list available local products:
`local_product -help`

To configure a database for aliases not specifying one (e.g. *no_db):
`local_product db <path to DB>`

## Installation

- Add the path to the root of this directory to your PATH environment variable
  `Start Menu > Edit System Env variables > Environment Variables > Edit PATH`
- To start all dev tools:
  `Set SW_MSF_STARTUP_MAGIK=<this repo>``/sw_msf_startup.magik`
- To start vscode tools only:
  `Set SW_MSF_STARTUP_MAGIK=<this repo>``/vscode_dev.magik`
- [Optional] Set SW_MAGIK_DEV_DIRS to include any directories of magik scripts that you wish to load - (see [HERE](load_magik_dev_files.magik))

## Operation

When a magik session starts, it will automatically load the code in a startup file. This is derived as follows:

* If the SW_MSF_STARTUP_MAGIK environment variable is set, load the file specified by it (recommended behaviour))
* If it is not set look for startup.magik or .magik files in your home directory (deprecated behaviour)

### sw_msf_startup.magik

This implements the **load_magik_dev** procedure which will iterate over a set of directories containing useful magik development code.
The default set of directories is the single directory `<this repo>`/magik_dev_dirs. You can add additional directories by setting the MAGIK_DEV_DIRS environment variable to a semi-colon separated list of additional directories to be scanned.
This file should be loaded at startup; it is recommended that this is done by setting the SW_MSF_STARTUP_MAGIK envioronment variable.

In order to ensure that a session can be run with no additional code, only the enabling procedures are loaded at startup, no additional code is loaded.

To load the directories, use:
`Magik> load_magik_dev()`

### The magik_dev_dirs directory

This directory contains files that will be attempted to load by calling Magik> load_magik_dev().

Each file relates to a particular set of tools, typically related to a product or module. Each file should has a call to confirm_magik_dev_file() at the top, and possibly repeated which ensures that only code appropriate to the session is loaded.

The files are loaded in alphabetical order so those that have to be loaded first have been prefixed with a number.
