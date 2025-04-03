# magik-dev

Magik development scripts

This repository is a store for shared scripts for Magik development.\
The scripts assume that VS Code is used for Magik development and \
the build_tools repo exists in **C:/projects/hg/build_tools.**

>Please add common scripts together with a description to this readme.\
>Please include documentation and example usage in the scripts.

## Installation

- Add the path to the root of this directory to your PATH environment variable

  `Start Menu > Edit System Env variables > Environment Variables > Edit PATH`

- To start all dev tools:
  
  `Set SW_MSF_STARTUP_MAGIK=`<this repo>`/vscode_dev.magik`
- To start vscode tools only:
  
  `Set SW_MSF_STARTUP_MAGIK=`<this repo>`/sw_msf_startup.magik`
- [Optional] Set SW_MAGIK_DEV_DIRS to include any directories of magik scripts that you wish to load - (see [HERE](load_magik_dev_files.magik))

## Usage

### install_magik.bat

NB.  The scripts called by this batch file, requires perl and jfrog to be installed on your machine.  Follow these instructions to install it:
https://devcloud.swcoe.ge.com/devspace/display/SWV/Working+solely+from+laptops#Workingsolelyfromlaptops-Magikenvironmentsetup

This is a simple wrapper to install Smallworld products using the scripts from build_tools.\
The script should be copied to a directory in your PATH.\
Examples of use:

`install_magik core` for installing core deployment

`install_magik pni` for installing pni deployment

Note, in most cases the name of the installer and the file are the same and in these cases install_magik will work as described.\
However, in some cases, the names do not match in which case you will need to call download_and_install explicitly with two arguments.\
Examples of this are as follows:

    call C:\projects\hg\build_tools\scripts\download_and_install.bat pni_ftth ftth
    call C:\projects\hg\build_tools\scripts\download_and_install.bat eo_web eoweb
    call C:\projects\hg\build_tools\scripts\download_and_install.bat eo_ssm eossm
    call C:\projects\hg\build_tools\scripts\download_and_install.bat gdo_ssm gdossm

### local_magik.bat

This is a script to start a Magik session from a local installation.\
The script finds the latest install from the last 14 days.

#### Arguments:

|command|description|
|---|---|
|`-debug`|enable debugger|
|`-java_debug`|enable java debugging|
|`-version`|choose a different version from the default which is 533|
|`-days=n`|run a version from n days ago|
|`-vvmds`|run in VVMDS mode|
|`-noinit`|do not open the database|
|`-use_s`|Run the latest deployment on the S: drive|
|`-print`|just write out the runalias command|

For available sessions use:\
`local_magik -help`

Most of the available sessions open the installed database.\
Some are named ***no_db** and require a DB to be configured for opening (see [local product](local_product.bat))

#### Examples of use:

To start the Cam DB application:\
`local_magik cam`

To start a debug session of PNI:\
`local_magik pni -debug`

### local_product.bat

Used to configure a session to load products from local repositories and/or to point at a specific DB

#### Examples of use:

- To load from a local EO product:\
  `local_product eo`
  
- To load from a local PNI SSM product:\
  `local_product pni_ssm`
  
> Multiple local product can be configured:\
  
- To see which products are configured for a local load:\
  `local_product -help`
  
- To reset, i.e. load from installed product:\
  `local_product unset`

- For all available configs:\
  `local_product -help`
  
- To configure a database for aliases not specifying one (e.g. *no_db):\
  `local_product db <path to DB>`
  
  >not an ACE dir!

## Magik files

### load_magik_dev_files.magik

Provides the mechanism to load directories of useful magik code.\
The default directory is <this repo>/magik_dev_dirs\
This file should be loaded at startup (recommended via SW_MSF_STARTUP_MAGIK, above)\
The directories will NOT be loaded at startup - some people like their sessions untainted!\
To load the directories, use\
`Magik> dev()`

### /magik_dev_dirs

This directory contains all files that will be attempted to load by calling Magik> dev()\
Each file should have a call to confirm_magik_dev_file() at the top, and possibly repeated.\  This is to abort the loading of any files inappropriate to the session.\
See load_magik_dev_files.magik for further details.

### ~~.magik~~ (deprecated) 

### sw_msf_startup.magik

The .magik file contained in this repo is a default implementation intended to be customised.\
Please copy this to your home directory.\
The .magik file is run at the end of the startup of a Magik session.\
The default implementation loads the utility code that is required in a session for development of Magik in VS Code.\
Add any code to your copy that you wish to run at startup.\
For example calling any other scripts from this repo e.g.:\
`load_file("C:/projects/hg/magik-dev/dev.magik")`

### ~~dev.magik~~ (deprecated) 

### load_magik_dev_files.magik

Relocates the products in the current session to local Magik respositories to support navigating local code.\
Loads the dev tools from the magik_tools module in Core.

### ~~ssm_dev.magik~~ (deprecated) 

### load_magik_dev_files.magik

Contains stubs for local SSM development. Add:\
`load_file("C:/projects/hg/magik-dev/ssm_dev.magik")` \
to your .magik copy.
