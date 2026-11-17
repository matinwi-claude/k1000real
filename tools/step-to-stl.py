"""
STEP -> binary STL via OpenCascade, for CAD that arrives as STEP (units as in the file;
SolidWorks exports are mm). Then add the STL to models-src/parts.json as usual.

    pip install cadquery-ocp
    python3 tools/step-to-stl.py models-src/part.step models-src/part.stl
"""
import sys
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.StlAPI import StlAPI_Writer
r = STEPControl_Reader()
if r.ReadFile(sys.argv[1]) != IFSelect_RetDone: sys.exit('cannot read STEP')
r.TransferRoots(); shape = r.OneShape()
BRepMesh_IncrementalMesh(shape, 0.05, False, 0.25, True)  # 0.05 mm chordal deflection, ~14° angular
w = StlAPI_Writer(); w.ASCIIMode = False
if not w.Write(shape, sys.argv[2]): sys.exit('cannot write STL')
