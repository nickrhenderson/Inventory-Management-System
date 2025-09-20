#!/usr/bin/env python3
"""
Build script for Inventory System
Converts PNG icon to ICO format and compiles the application to executable
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

def check_pyinstaller():
    """Check if PyInstaller is installed"""
    try:
        import PyInstaller
        print(f"✓ PyInstaller is installed (version: {PyInstaller.__version__})")
        return True
    except ImportError:
        print("✗ PyInstaller is not installed")
        print("Installing PyInstaller...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)
        return True

def convert_png_to_ico():
    """Convert PNG icon to ICO format using PIL/Pillow"""
    png_path = Path("static/img/bad-bandit.png")
    ico_path = Path("static/img/bad-bandit.ico")
    
    if not png_path.exists():
        print(f"✗ Icon file not found: {png_path}")
        return None
    
    if ico_path.exists():
        print(f"✓ ICO file already exists: {ico_path}")
        return str(ico_path)
    
    try:
        from PIL import Image
        print(f"Converting {png_path} to {ico_path}...")
        
        # Open PNG image
        img = Image.open(png_path)
        
        # Convert to RGBA if not already
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Create multiple sizes for ICO file
        sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        images = []
        
        for size in sizes:
            resized = img.resize(size, Image.Resampling.LANCZOS)
            images.append(resized)
        
        # Save as ICO with multiple sizes
        images[0].save(
            ico_path,
            format='ICO',
            sizes=[(img.width, img.height) for img in images],
            append_images=images[1:]
        )
        
        print(f"✓ Successfully converted to ICO: {ico_path}")
        return str(ico_path)
        
    except ImportError:
        print("✗ Pillow (PIL) is not installed")
        print("Installing Pillow...")
        subprocess.run([sys.executable, "-m", "pip", "install", "Pillow"], check=True)
        return convert_png_to_ico()  # Retry after installation
    
    except Exception as e:
        print(f"✗ Error converting PNG to ICO: {e}")
        print("Using PNG file instead (may not work as well)")
        return str(png_path)

def build_executable():
    """Build the executable using PyInstaller"""
    
    # Check if PyInstaller is available
    check_pyinstaller()
    
    # Convert icon to ICO format
    icon_path = convert_png_to_ico()
    if not icon_path:
        print("✗ Could not prepare icon file")
        return False
    
    # PyInstaller command
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",                    # Create a single executable file
        "--windowed",                   # Don't show console window
        f"--icon={icon_path}",         # Set application icon
        "--name=InventorySystem",       # Name of the executable
        "--distpath=dist",              # Output directory
        "--workpath=build",             # Temporary build directory
        "--clean",                      # Clean PyInstaller cache
        "main.py"                       # Main Python file
    ]
    
    # Add data files (HTML, CSS, JS, images, database)
    # Format: source_path:destination_path
    data_mappings = [
        ("index.html", "."),               # HTML file in root
        ("static", "static"),              # Entire static folder
        ("data", "data")                   # Database folder
    ]
    
    for source, dest in data_mappings:
        if os.path.exists(source):
            cmd.extend(["--add-data", f"{source};{dest}"])
            print(f"  Adding: {source} -> {dest}")
        else:
            print(f"  Warning: {source} not found, skipping")
    
    # Add additional PyInstaller options for better web app support
    cmd.extend([
        "--collect-data", "webview",      # Include webview data files
        "--hidden-import", "sqlite3",     # Ensure sqlite3 is included
        "--hidden-import", "webview",     # Ensure webview is included
    ])
    
    print("Building executable...")
    print("Command:", " ".join(cmd))
    print("-" * 50)
    
    try:
        # Run PyInstaller
        result = subprocess.run(cmd, check=True, capture_output=False)
        
        print("-" * 50)
        print("✓ Build completed successfully!")
        
        exe_path = Path("dist/InventorySystem.exe")
        if exe_path.exists():
            print(f"✓ Executable created: {exe_path.absolute()}")
            print(f"✓ File size: {exe_path.stat().st_size / (1024*1024):.1f} MB")
        else:
            print("✗ Executable not found in expected location")
            
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"✗ Build failed with error code: {e.returncode}")
        return False
    except Exception as e:
        print(f"✗ Build failed with error: {e}")
        return False

def clean_build_files():
    """Clean up build artifacts"""
    dirs_to_clean = ["build", "__pycache__"]
    files_to_clean = ["InventorySystem.spec"]
    
    for dir_name in dirs_to_clean:
        if os.path.exists(dir_name):
            shutil.rmtree(dir_name)
            print(f"✓ Cleaned: {dir_name}/")
    
    for file_name in files_to_clean:
        if os.path.exists(file_name):
            os.remove(file_name)
            print(f"✓ Cleaned: {file_name}")

def main():
    """Main build function"""
    print("=" * 60)
    print("         INVENTORY SYSTEM - BUILD SCRIPT")
    print("=" * 60)
    
    # Check if we're in the right directory
    if not os.path.exists("main.py"):
        print("✗ main.py not found. Please run this script from the project root directory.")
        sys.exit(1)
    
    try:
        # Build the executable
        success = build_executable()
        
        if success:
            print("\n" + "=" * 60)
            print("BUILD COMPLETED SUCCESSFULLY!")
            print("=" * 60)
            print("Your executable is ready:")
            print("📁 Location: dist/InventorySystem.exe")
            print("🎨 Icon: Custom bad-bandit icon")
            print("📦 Type: Single file executable")
            print("\nYou can now run InventorySystem.exe without Python installed!")
            
            # Ask if user wants to clean build files
            response = input("\nClean build files? (y/N): ").strip().lower()
            if response in ['y', 'yes']:
                clean_build_files()
                print("✓ Build files cleaned")
        else:
            print("\n" + "=" * 60)
            print("BUILD FAILED!")
            print("=" * 60)
            print("Please check the error messages above and try again.")
            
    except KeyboardInterrupt:
        print("\n\n✗ Build cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()